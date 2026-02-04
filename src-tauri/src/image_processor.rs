use crate::embroidery::{process_pattern, ProcessingConfig};
use crate::regions::{
    extract_regions_cached, GridPoint, RegionExtractionPayload, RegionLegendEntry, RegionStitch,
};
use image::GenericImageView;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::fs;
use std::path::PathBuf;
use std::time::Instant;
use tauri::Manager;

const PIPELINE_CACHE_VERSION: u8 = 2;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HoopConfig {
    pub shape: HoopShape,
    pub center_x: f32,
    pub center_y: f32,
    pub width: f32,
    pub height: f32,
    pub rotation: f32,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum HoopShape {
    Circle,
    Square,
    Oval,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RegionData {
    pub width: u32,
    pub height: u32,
    pub regions: Vec<VectorRegion>,
    pub palette: Vec<String>,
    pub perf: PerfStats,
    pub cache_key: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PerfStats {
    pub decode_ms: u64,
    pub quantize_ms: u64,
    pub contour_ms: u64,
    pub total_ms: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct VectorRegion {
    pub region_id: String,
    pub color: RegionColor,
    pub area_px: usize,
    pub path_svg: String,
    pub holes_svg: Vec<String>,
    pub bbox: RegionBounds,
    pub centroid_x: f32,
    pub centroid_y: f32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RegionColor {
    pub rgb: [u8; 3],
    pub hex: String,
    pub dmc_code: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RegionBounds {
    pub x: f32,
    pub y: f32,
    pub w: f32,
    pub h: f32,
}

pub fn process_image_pipeline(
    app: &tauri::AppHandle,
    image_data: Vec<u8>,
    color_count: u8,
    detail_level: f32,
    hoop_config: HoopConfig,
) -> Result<RegionData, String> {
    let total_start = Instant::now();
    let color_count = color_count.clamp(2, 64);
    let detail_level = detail_level.clamp(0.0, 1.0);
    let cache_key = build_cache_key(&image_data, color_count, detail_level, &hoop_config);

    if let Some(cached) = read_cache(app, &cache_key)? {
        return Ok(cached);
    }

    let decode_start = Instant::now();
    let decoded = image::load_from_memory(&image_data)
        .map_err(|e| format!("Failed to decode image bytes: {}", e))?;
    let (width, height) = decoded.dimensions();
    if width < 2 || height < 2 {
        return Err("Image too small. Minimum size is 2x2.".to_string());
    }
    let decode_ms = decode_start.elapsed().as_millis() as u64;

    let quantize_start = Instant::now();
    let min_region_size = if detail_level >= 0.8 {
        1
    } else if detail_level >= 0.55 {
        2
    } else if detail_level >= 0.3 {
        3
    } else {
        4
    };
    let config = ProcessingConfig {
        color_count: color_count as u32,
        // Keep quantized colors distinct for contour extraction; DMC remapping can collapse labels.
        use_dmc_palette: false,
        // Preserved for compatibility with existing native config fields.
        smoothing_amount: 0.2 + (1.0 - detail_level) * 0.4,
        simplify_amount: 0.1 + (1.0 - detail_level) * 0.5,
        min_region_size,
    };
    let hoop_mask = build_hoop_mask(width, height, &hoop_config);
    let pattern = process_pattern(&image_data, &config, Some(&hoop_mask))?;
    let quantize_ms = quantize_start.elapsed().as_millis() as u64;

    let contour_start = Instant::now();
    let payload = RegionExtractionPayload {
        width: pattern.width,
        height: pattern.height,
        stitches: pattern
            .stitches
            .iter()
            .map(|s| RegionStitch {
                x: s.x,
                y: s.y,
                dmc_code: s.dmc_code.clone(),
                hex: s.hex.clone(),
            })
            .collect(),
        legend: pattern
            .legend
            .iter()
            .map(|l| RegionLegendEntry {
                dmc_code: l.dmc_code.clone(),
                hex: l.hex.clone(),
            })
            .collect(),
    };

    let extracted = extract_regions_cached(&payload)?;
    let regions = extracted
        .into_iter()
        .map(|region| {
            let mut loops = region
                .loops
                .into_iter()
                .map(|l| {
                    let points = loop_to_points(&l);
                    simplify_and_smooth_loop(points, detail_level)
                })
                .filter(|l| l.len() >= 4)
                .collect::<Vec<_>>();

            loops.sort_by(|a, b| {
                let area_a = polygon_area(a).abs();
                let area_b = polygon_area(b).abs();
                area_b
                    .partial_cmp(&area_a)
                    .unwrap_or(std::cmp::Ordering::Equal)
            });

            let outer = loops.first().cloned().unwrap_or_default();
            let holes = if loops.len() > 1 {
                loops[1..].to_vec()
            } else {
                Vec::new()
            };

            let bbox = bounds_for_loop(&outer);
            let path_svg = points_to_svg_path(&outer);
            let holes_svg = holes
                .iter()
                .map(|h| points_to_svg_path(h))
                .collect::<Vec<_>>();

            VectorRegion {
                region_id: format!("r_{}", region.id),
                color: RegionColor {
                    rgb: hex_to_rgb(&region.hex).unwrap_or([0, 0, 0]),
                    hex: region.hex.clone(),
                    dmc_code: (!region.dmc_code.starts_with("RAW-"))
                        .then_some(region.dmc_code.clone()),
                },
                area_px: region.area,
                path_svg,
                holes_svg,
                bbox,
                centroid_x: region.centroid_x,
                centroid_y: region.centroid_y,
            }
        })
        .collect::<Vec<_>>();
    let contour_ms = contour_start.elapsed().as_millis() as u64;

    let total_ms = total_start.elapsed().as_millis() as u64;
    let mut palette = Vec::<String>::new();
    for region in &regions {
        if !palette.iter().any(|hex| hex == &region.color.hex) {
            palette.push(region.color.hex.clone());
        }
    }

    let result = RegionData {
        width: pattern.width,
        height: pattern.height,
        regions,
        palette,
        perf: PerfStats {
            decode_ms,
            quantize_ms,
            contour_ms,
            total_ms,
        },
        cache_key: cache_key.clone(),
    };

    write_cache(app, &cache_key, &result)?;
    Ok(result)
}

fn build_cache_key(
    image_data: &[u8],
    color_count: u8,
    detail_level: f32,
    hoop_config: &HoopConfig,
) -> String {
    let mut hasher = Sha256::new();
    hasher.update([PIPELINE_CACHE_VERSION]);
    hasher.update(image_data);
    hasher.update([color_count]);
    hasher.update(detail_level.to_le_bytes());
    hasher.update(hoop_config.center_x.to_le_bytes());
    hasher.update(hoop_config.center_y.to_le_bytes());
    hasher.update(hoop_config.width.to_le_bytes());
    hasher.update(hoop_config.height.to_le_bytes());
    hasher.update(hoop_config.rotation.to_le_bytes());
    hasher.update([match hoop_config.shape {
        HoopShape::Circle => 0,
        HoopShape::Square => 1,
        HoopShape::Oval => 2,
    }]);
    format!("{:x}", hasher.finalize())
}

fn build_hoop_mask(width: u32, height: u32, hoop: &HoopConfig) -> Vec<u8> {
    let mut mask = vec![0u8; (width * height) as usize];
    for y in 0..height {
        let y_off = (y * width) as usize;
        for x in 0..width {
            if is_inside_hoop(x as f32 + 0.5, y as f32 + 0.5, hoop) {
                mask[y_off + x as usize] = 1;
            }
        }
    }
    mask
}

fn is_inside_hoop(x: f32, y: f32, hoop: &HoopConfig) -> bool {
    let half_w = (hoop.width * 0.5).max(0.0001);
    let half_h = (hoop.height * 0.5).max(0.0001);
    let dx = x - hoop.center_x;
    let dy = y - hoop.center_y;
    let radians = hoop.rotation.to_radians();
    let cos_r = radians.cos();
    let sin_r = radians.sin();
    let rx = dx * cos_r + dy * sin_r;
    let ry = -dx * sin_r + dy * cos_r;
    let nx = rx / half_w;
    let ny = ry / half_h;

    match hoop.shape {
        HoopShape::Circle | HoopShape::Oval => nx * nx + ny * ny <= 1.0,
        HoopShape::Square => nx.abs() <= 1.0 && ny.abs() <= 1.0,
    }
}

fn cache_file(app: &tauri::AppHandle, key: &str) -> Result<PathBuf, String> {
    let mut dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("Failed to locate app data dir: {}", e))?;
    dir.push("image_pipeline_cache");
    fs::create_dir_all(&dir).map_err(|e| format!("Failed to create cache directory: {}", e))?;
    Ok(dir.join(format!("{}.json", key)))
}

fn read_cache(app: &tauri::AppHandle, key: &str) -> Result<Option<RegionData>, String> {
    let path = cache_file(app, key)?;
    if !path.exists() {
        return Ok(None);
    }
    let bytes = fs::read(&path).map_err(|e| format!("Failed to read cache file: {}", e))?;
    let parsed: RegionData =
        serde_json::from_slice(&bytes).map_err(|e| format!("Failed to parse cache file: {}", e))?;
    Ok(Some(parsed))
}

fn write_cache(app: &tauri::AppHandle, key: &str, data: &RegionData) -> Result<(), String> {
    let path = cache_file(app, key)?;
    let payload = serde_json::to_vec(data)
        .map_err(|e| format!("Failed to serialize cache payload: {}", e))?;
    fs::write(path, payload).map_err(|e| format!("Failed to write cache file: {}", e))
}

fn loop_to_points(loop_points: &[GridPoint]) -> Vec<[f32; 2]> {
    loop_points
        .iter()
        .map(|p| [p.x as f32, p.y as f32])
        .collect()
}

fn simplify_and_smooth_loop(points: Vec<[f32; 2]>, detail_level: f32) -> Vec<[f32; 2]> {
    if points.len() < 4 {
        return points;
    }

    let normalized = normalize_closed_loop(&points);
    if normalized.len() < 3 {
        return points;
    }

    let tolerance = 0.08 + (1.0 - detail_level) * 0.35;
    let mut simplified = simplify_closed_loop_corner_aware(&normalized, detail_level, tolerance);
    if simplified.first() != simplified.last() {
        simplified.push(simplified[0]);
    }

    // Avoid over-rounding contours; only apply a tiny smoothing pass at highest detail.
    let iterations = if detail_level >= 0.92 { 1 } else { 0 };

    let mut smoothed = simplified;
    for _ in 0..iterations {
        smoothed = chaikin_closed(&smoothed);
    }

    if smoothed.first() != smoothed.last() && !smoothed.is_empty() {
        smoothed.push(smoothed[0]);
    }
    smoothed
}

fn normalize_closed_loop(points: &[[f32; 2]]) -> Vec<[f32; 2]> {
    if points.is_empty() {
        return Vec::new();
    }

    let mut out = Vec::with_capacity(points.len());
    for point in points {
        if out.last().copied() != Some(*point) {
            out.push(*point);
        }
    }
    if out.first().copied() == out.last().copied() {
        out.pop();
    }
    out
}

fn simplify_closed_loop_corner_aware(
    ring: &[[f32; 2]],
    detail_level: f32,
    epsilon: f32,
) -> Vec<[f32; 2]> {
    if ring.len() < 3 {
        return ring.to_vec();
    }

    let corner_threshold = 115.0 + detail_level * 55.0;
    let mut anchors = find_corner_indices(ring, corner_threshold);
    anchors.push(0);
    anchors.sort_unstable();
    anchors.dedup();

    if anchors.len() < 2 {
        return rdp(ring, epsilon);
    }

    let mut output = Vec::new();
    for idx in 0..anchors.len() {
        let start = anchors[idx];
        let end = anchors[(idx + 1) % anchors.len()];
        let segment = closed_ring_segment(ring, start, end);
        if segment.len() < 2 {
            continue;
        }
        let mut seg_simplified = rdp(&segment, epsilon);
        if !output.is_empty() && !seg_simplified.is_empty() {
            seg_simplified.remove(0);
        }
        output.extend(seg_simplified);
    }

    if output.len() < 3 {
        ring.to_vec()
    } else {
        output
    }
}

fn find_corner_indices(ring: &[[f32; 2]], threshold_degrees: f32) -> Vec<usize> {
    let mut corners = Vec::new();
    let n = ring.len();
    if n < 3 {
        return corners;
    }

    for i in 0..n {
        let prev = ring[(i + n - 1) % n];
        let curr = ring[i];
        let next = ring[(i + 1) % n];
        let angle = interior_angle_degrees(prev, curr, next);
        if angle <= threshold_degrees {
            corners.push(i);
        }
    }
    corners
}

fn closed_ring_segment(ring: &[[f32; 2]], start: usize, end: usize) -> Vec<[f32; 2]> {
    let n = ring.len();
    let mut segment = Vec::new();
    let mut idx = start;
    loop {
        segment.push(ring[idx]);
        if idx == end {
            break;
        }
        idx = (idx + 1) % n;
    }
    segment
}

fn interior_angle_degrees(prev: [f32; 2], curr: [f32; 2], next: [f32; 2]) -> f32 {
    let v1 = [prev[0] - curr[0], prev[1] - curr[1]];
    let v2 = [next[0] - curr[0], next[1] - curr[1]];
    let len1 = (v1[0] * v1[0] + v1[1] * v1[1]).sqrt();
    let len2 = (v2[0] * v2[0] + v2[1] * v2[1]).sqrt();

    if len1 <= f32::EPSILON || len2 <= f32::EPSILON {
        return 180.0;
    }

    let dot = (v1[0] * v2[0] + v1[1] * v2[1]) / (len1 * len2);
    let clamped = dot.clamp(-1.0, 1.0);
    clamped.acos().to_degrees()
}

fn rdp(points: &[[f32; 2]], epsilon: f32) -> Vec<[f32; 2]> {
    if points.len() <= 2 {
        return points.to_vec();
    }

    let first = points[0];
    let last = points[points.len() - 1];
    let mut max_dist = 0.0;
    let mut index = 0usize;

    for (i, point) in points.iter().enumerate().take(points.len() - 1).skip(1) {
        let dist = perpendicular_distance(*point, first, last);
        if dist > max_dist {
            index = i;
            max_dist = dist;
        }
    }

    if max_dist > epsilon {
        let mut left = rdp(&points[..=index], epsilon);
        let right = rdp(&points[index..], epsilon);
        left.pop();
        left.into_iter().chain(right).collect()
    } else {
        vec![first, last]
    }
}

fn perpendicular_distance(point: [f32; 2], line_start: [f32; 2], line_end: [f32; 2]) -> f32 {
    let dx = line_end[0] - line_start[0];
    let dy = line_end[1] - line_start[1];
    if dx.abs() < f32::EPSILON && dy.abs() < f32::EPSILON {
        let px = point[0] - line_start[0];
        let py = point[1] - line_start[1];
        return (px * px + py * py).sqrt();
    }

    let numerator = (dy * point[0] - dx * point[1] + line_end[0] * line_start[1]
        - line_end[1] * line_start[0])
        .abs();
    let denominator = (dx * dx + dy * dy).sqrt();
    numerator / denominator
}

fn chaikin_closed(points: &[[f32; 2]]) -> Vec<[f32; 2]> {
    if points.len() < 4 {
        return points.to_vec();
    }

    let mut out = Vec::with_capacity(points.len() * 2);
    let n = points.len() - 1;
    for i in 0..n {
        let p0 = points[i];
        let p1 = points[(i + 1) % n];
        let q = [0.75 * p0[0] + 0.25 * p1[0], 0.75 * p0[1] + 0.25 * p1[1]];
        let r = [0.25 * p0[0] + 0.75 * p1[0], 0.25 * p0[1] + 0.75 * p1[1]];
        out.push(q);
        out.push(r);
    }
    if !out.is_empty() {
        out.push(out[0]);
    }
    out
}

fn points_to_svg_path(points: &[[f32; 2]]) -> String {
    if points.len() < 2 {
        return String::new();
    }
    let mut out = String::new();
    for (i, p) in points.iter().enumerate() {
        if i == 0 {
            out.push_str(&format!("M {:.2} {:.2}", p[0], p[1]));
        } else {
            out.push_str(&format!(" L {:.2} {:.2}", p[0], p[1]));
        }
    }
    out.push_str(" Z");
    out
}

fn bounds_for_loop(points: &[[f32; 2]]) -> RegionBounds {
    if points.is_empty() {
        return RegionBounds {
            x: 0.0,
            y: 0.0,
            w: 0.0,
            h: 0.0,
        };
    }

    let mut min_x = f32::MAX;
    let mut min_y = f32::MAX;
    let mut max_x = f32::MIN;
    let mut max_y = f32::MIN;
    for p in points {
        min_x = min_x.min(p[0]);
        min_y = min_y.min(p[1]);
        max_x = max_x.max(p[0]);
        max_y = max_y.max(p[1]);
    }

    RegionBounds {
        x: min_x,
        y: min_y,
        w: (max_x - min_x).max(0.0),
        h: (max_y - min_y).max(0.0),
    }
}

fn polygon_area(points: &[[f32; 2]]) -> f32 {
    if points.len() < 4 {
        return 0.0;
    }
    let mut area = 0.0f32;
    for i in 0..(points.len() - 1) {
        area += points[i][0] * points[i + 1][1] - points[i + 1][0] * points[i][1];
    }
    area * 0.5
}

fn hex_to_rgb(hex: &str) -> Option<[u8; 3]> {
    let trimmed = hex.trim_start_matches('#');
    if trimmed.len() != 6 {
        return None;
    }
    let r = u8::from_str_radix(&trimmed[0..2], 16).ok()?;
    let g = u8::from_str_radix(&trimmed[2..4], 16).ok()?;
    let b = u8::from_str_radix(&trimmed[4..6], 16).ok()?;
    Some([r, g, b])
}
