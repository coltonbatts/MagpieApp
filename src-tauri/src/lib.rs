mod embroidery;

use embroidery::{process_pattern, process_pattern_from_path, PatternResult, ProcessingConfig};
use rfd::FileDialog;
use serde::Deserialize;
use std::fs;
use std::path::{Path, PathBuf};

#[derive(Deserialize)]
struct DialogFilter {
    name: String,
    extensions: Vec<String>,
}

#[tauri::command]
fn desktop_select_save_path(
    default_name: String,
    title: Option<String>,
    filters: Vec<DialogFilter>,
) -> Option<String> {
    let mut dialog = FileDialog::new().set_file_name(&default_name);
    if let Some(title) = title {
        dialog = dialog.set_title(&title);
    }

    for filter in filters {
        let extensions: Vec<&str> = filter.extensions.iter().map(String::as_str).collect();
        dialog = dialog.add_filter(&filter.name, &extensions);
    }

    dialog
        .save_file()
        .map(|path| path.to_string_lossy().to_string())
}

#[tauri::command]
fn desktop_select_folder(title: Option<String>) -> Option<String> {
    let mut dialog = FileDialog::new();
    if let Some(title) = title {
        dialog = dialog.set_title(&title);
    }

    dialog
        .pick_folder()
        .map(|path| path.to_string_lossy().to_string())
}

#[tauri::command]
fn desktop_write_file(path: String, contents: Vec<u8>) -> Result<(), String> {
    let path_ref = Path::new(&path);
    if let Some(parent) = path_ref.parent() {
        fs::create_dir_all(parent).map_err(|err| err.to_string())?;
    }

    fs::write(path_ref, contents).map_err(|err| err.to_string())
}

#[tauri::command]
fn desktop_open_in_folder(path: String) -> Result<(), String> {
    let path_buf = PathBuf::from(path);
    let target = if path_buf.is_dir() {
        path_buf
    } else {
        path_buf.parent().map(Path::to_path_buf).unwrap_or(path_buf)
    };

    opener::open(target).map_err(|err| err.to_string())
}

/// Process an image into an embroidery pattern using native Rust performance.
///
/// This command offloads heavy computation from the browser:
/// - Image decoding and color space conversion
/// - K-means color quantization (parallelized with rayon)
/// - DMC thread color matching using CIEDE2000 Delta-E algorithm
///
/// # Arguments
/// * `image_bytes` - Raw image bytes (PNG, JPEG, etc.)
/// * `config` - Processing configuration (color count, DMC mapping, etc.)
/// * `mask` - Optional mask bytes (255 = include, 0 = exclude/fabric)
///
/// # Returns
/// PatternResult containing stitches, palette, legend, and processing time
#[tauri::command]
fn process_embroidery_pattern(
    image_bytes: Vec<u8>,
    config: ProcessingConfig,
    mask: Option<Vec<u8>>,
) -> Result<PatternResult, String> {
    log::info!(
        "Processing embroidery pattern: {} bytes, {} colors, DMC={}",
        image_bytes.len(),
        config.color_count,
        config.use_dmc_palette
    );

    let mask_slice = mask.as_deref();
    let result = process_pattern(&image_bytes, &config, mask_slice)?;

    log::info!(
        "Pattern processed: {}x{}, {} stitches, {} colors, {}ms",
        result.width,
        result.height,
        result.total_stitches,
        result.palette.len(),
        result.processing_time_ms
    );

    Ok(result)
}

/// Process an image from a file path into an embroidery pattern.
///
/// Alternative to process_embroidery_pattern when the image is already on disk.
#[tauri::command]
fn process_embroidery_pattern_from_file(
    file_path: String,
    config: ProcessingConfig,
    mask: Option<Vec<u8>>,
) -> Result<PatternResult, String> {
    log::info!("Processing embroidery pattern from file: {}", file_path);

    let mask_slice = mask.as_deref();
    let result = process_pattern_from_path(&file_path, &config, mask_slice)?;

    log::info!(
        "Pattern processed: {}x{}, {} stitches, {} colors, {}ms",
        result.width,
        result.height,
        result.total_stitches,
        result.palette.len(),
        result.processing_time_ms
    );

    Ok(result)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            desktop_select_save_path,
            desktop_select_folder,
            desktop_write_file,
            desktop_open_in_folder,
            process_embroidery_pattern,
            process_embroidery_pattern_from_file,
        ])
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
