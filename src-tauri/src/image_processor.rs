use crate::embroidery::{process_pattern, ProcessingConfig};
use image::GenericImageView;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::fs;
use std::path::PathBuf;
use std::time::Instant;
use tauri::Manager;
use crate::regions::{color_key, is_fabric_code};

const PIPELINE_CACHE_VERSION: u8 = 4; // Force another invalidation

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
    pub dmc_name: Option<String>,
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

    let pre_proc_start = Instant::now();
    // 1. Preprocessing: Median filter to kill "Lego" noise and dithering artifacts
    let mut image_buffer = decoded.to_rgba8();
    let x_radius = if detail_level >= 0.8 { 1 } else { 2 };
    let y_radius = x_radius;
    let filtered = imageproc::filter::median_filter(&image_buffer, x_radius, y_radius);
    image_buffer = filtered;
    
    // Convert back to raw bytes for pattern processing
    let mut image_data_filtered = Vec::new();
    let mut cursor = std::io::Cursor::new(&mut image_data_filtered);
    let _ = image::DynamicImage::ImageRgba8(image_buffer.clone())
        .write_to(&mut cursor, image::ImageFormat::Png);
    let pre_proc_ms = pre_proc_start.elapsed().as_millis() as u64;

    let quantize_start = Instant::now();
    let min_region_size = if detail_level >= 0.8 {
        4
    } else if detail_level >= 0.5 {
        15
    } else {
        40 // Aggressive noise removal for 'simple' patterns
    };
    let config = ProcessingConfig {
        color_count: color_count as u32,
        use_dmc_palette: true, 
        smoothing_amount: 0.4 + (1.0 - detail_level) * 0.4,
        simplify_amount: 0.2 + (1.0 - detail_level) * 0.5,
        min_region_size,
    };
    let hoop_mask = build_hoop_mask(width, height, &hoop_config);
    // Process pattern on the FILTERED image
    let pattern = process_pattern(&image_data_filtered, &config, Some(&hoop_mask))?;
    let quantize_ms = quantize_start.elapsed().as_millis() as u64;

    let tracer_start = Instant::now();
    
    // Create a color-indexed buffer for vtracer
    let mut indexed_buffer = image::ImageBuffer::<image::Luma<u16>, Vec<u16>>::new(width, height);
    for stitch in &pattern.stitches {
        let label = pattern.palette.iter().position(|hex| hex == &stitch.hex).unwrap_or(0);
        indexed_buffer.put_pixel(stitch.x, stitch.y, image::Luma([label as u16]));
    }

    // Use vtracer for professional curve extraction
    use vtracer::{Config, ColorMode, Hierarchical};
    
    // Create a color-indexed buffer for vtracer
    // However, since we already have the clusters from our DMC-aware k-means, 
    // we should ideally feed it the quantized image.
    let mut quantized_img = image::ImageBuffer::<image::Rgba<u8>, Vec<u8>>::new(width, height);
    for stitch in &pattern.stitches {
        let rgb = hex_to_rgb(&stitch.hex).unwrap_or([0, 0, 0]);
        quantized_img.put_pixel(stitch.x, stitch.y, image::Rgba([rgb[0], rgb[1], rgb[2], 255]));
    }

    let pixels = quantized_img.into_raw();

    let v_img = visioncortex::ColorImage {
        pixels,
        width: width as usize,
        height: height as usize,
    };

    let v_config = Config {
        color_mode: ColorMode::Color,
        hierarchical: Hierarchical::Stacked,
        filter_speckle: min_region_size as usize,
        color_precision: 8,
        layer_difference: 0,
        mode: visioncortex::PathSimplifyMode::Spline,
        corner_threshold: 60,
        length_threshold: 4.0,
        max_iterations: 10,
        splice_threshold: 45,
        path_precision: Some(2),
    };

    // vtracer::convert returns Result<SvgFile, String>
    let svg_obj = vtracer::convert(v_img, v_config).map_err(|e| format!("VTracer error: {}", e))?;
    let svg_str = svg_obj.to_string();
    
    let regions = parse_v_svg_to_regions(&svg_str, &pattern);

    let tracer_ms = tracer_start.elapsed().as_millis() as u64;
    let total_ms = total_start.elapsed().as_millis() as u64;

    let result = RegionData {
        width: pattern.width,
        height: pattern.height,
        regions,
        palette: pattern.palette,
        perf: PerfStats {
            decode_ms,
            quantize_ms: quantize_ms + pre_proc_ms,
            contour_ms: tracer_ms,
            total_ms,
        },
        cache_key: cache_key.clone(),
    };

    write_cache(app, &cache_key, &result)?;
    Ok(result)
}

fn parse_v_svg_to_regions(svg: &str, pattern: &crate::embroidery::PatternResult) -> Vec<VectorRegion> {
    use regex::Regex;
    
    // Regex that handles fill/d in any order
    let path_re = Regex::new(r#"(?x)
        <path\s+[^>]*?
        (?:
            fill="(?P<f1>[^"]+)"[^>]*?d="(?P<d1>[^"]+)"
            |
            d="(?P<d2>[^"]+)"[^>]*?fill="(?P<f2>[^"]+)"
        )
        [^>]*?>
    "#).unwrap();
    
    let mut regions = Vec::new();
    let mut id_counter = 0;

    for cap in path_re.captures_iter(svg) {
        let raw_fill = cap.name("f1").or_else(|| cap.name("f2")).map(|m| m.as_str().to_string());
        let path_d = cap.name("d1").or_else(|| cap.name("d2")).map(|m| m.as_str().to_string());
        
        if let (Some(mut fill), Some(d)) = (raw_fill, path_d) {
            // Normalize hex color for matching
            if !fill.starts_with('#') && fill.len() == 6 {
                fill = format!("#{}", fill);
            }
            let hex = fill.to_uppercase();
            let current_rgb = hex_to_rgb(&hex).unwrap_or([0, 0, 0]);
            
            // Find matching DMC from pattern - first try exact match
            let mut dmc_match = pattern.color_mappings.iter().find(|m| {
                m.mapped_hex.to_uppercase() == hex || 
                m.original_hex.to_uppercase() == hex ||
                m.mapped_hex.trim_start_matches('#').to_uppercase() == hex.trim_start_matches('#') ||
                m.original_hex.trim_start_matches('#').to_uppercase() == hex.trim_start_matches('#')
            });

            // Fallback: Fuzzy match if exact match fails (vtracer can drift colors slightly)
            if dmc_match.is_none() {
                dmc_match = pattern.color_mappings.iter().min_by_key(|m| {
                    let m_rgb = hex_to_rgb(&m.mapped_hex).unwrap_or([0, 0, 0]);
                    let dr = (m_rgb[0] as i32 - current_rgb[0] as i32).pow(2);
                    let dg = (m_rgb[1] as i32 - current_rgb[1] as i32).pow(2);
                    let db = (m_rgb[2] as i32 - current_rgb[2] as i32).pow(2);
                    dr + dg + db
                });
            }
            
            if let Some(m) = dmc_match {
                id_counter += 1;
                regions.push(VectorRegion {
                    region_id: format!("v_{}", id_counter),
                    color: RegionColor {
                        rgb: hex_to_rgb(&m.mapped_hex).unwrap_or([0, 0, 0]),
                        hex: m.mapped_hex.clone(), // Use the official mapped DMC hex
                        dmc_code: Some(m.dmc.code.clone()),
                        dmc_name: Some(m.dmc.name.clone()),
                    },
                    area_px: 1, // Minimal area to ensure legend displays
                    path_svg: d,
                    holes_svg: Vec::new(), 
                    bbox: RegionBounds { x: 0.0, y: 0.0, w: pattern.width as f32, h: pattern.height as f32 },
                    centroid_x: 0.0,
                    centroid_y: 0.0,
                });
            }
        }
    }
    
    regions
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
