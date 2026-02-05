use crate::embroidery::{process_pattern, ProcessingConfig};
use crate::stage4::{build_stage4_regions, Stage4Config, Stage4Contract, Stage4Preset};
use image::GenericImageView;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::fs;
use std::path::PathBuf;
use std::time::Instant;
use tauri::Manager;

const PIPELINE_CACHE_VERSION: u8 = 8; // Bumped for Stage 4 contract + preset pipeline

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
    pub stage4: Stage4Contract,
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
    pub path_offset_x: f32,
    pub path_offset_y: f32,
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

    // Store original dimensions for consistent coordinate space.
    let original_width = width;
    let original_height = height;

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

    let contour_start = Instant::now();
    let stage4_preset = stage4_preset_from_detail(detail_level);
    let stage4_config = Stage4Config::from_preset(
        stage4_preset,
        color_count as usize,
        min_region_size as usize,
    );
    let stage4 = build_stage4_regions(&pattern, &stage4_config, stage4_preset)?;
    if let Some(reason) = &stage4.fallback_reason {
        log::warn!("Stage 4 deterministic fallback: {:?}", reason);
    }
    let regions = stage4
        .regions
        .into_iter()
        .map(|region| VectorRegion {
            region_id: region.region_id,
            color: RegionColor {
                rgb: region.color.rgb,
                hex: region.color.hex,
                dmc_code: region.color.dmc_code,
                dmc_name: region.color.dmc_name,
            },
            area_px: region.area_px,
            path_svg: region.path_svg,
            path_offset_x: region.path_offset_x,
            path_offset_y: region.path_offset_y,
            holes_svg: region.holes_svg,
            bbox: RegionBounds {
                x: region.bbox.x,
                y: region.bbox.y,
                w: region.bbox.w,
                h: region.bbox.h,
            },
            centroid_x: region.centroid_x,
            centroid_y: region.centroid_y,
        })
        .collect::<Vec<_>>();

    let tracer_ms = contour_start.elapsed().as_millis() as u64;
    let total_ms = total_start.elapsed().as_millis() as u64;

    let result = RegionData {
        // Use original dimensions to maintain coordinate space consistency with frontend
        width: original_width,
        height: original_height,
        stage4: stage4.contract,
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

fn stage4_preset_from_detail(detail_level: f32) -> Stage4Preset {
    if detail_level < 0.33 {
        Stage4Preset::Draft
    } else if detail_level < 0.78 {
        Stage4Preset::Standard
    } else {
        Stage4Preset::HighDetail
    }
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
