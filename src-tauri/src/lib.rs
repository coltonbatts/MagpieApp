mod embroidery;
mod image_processor;
mod pdf_export;
mod project_hub;
mod regions;
mod selection;

use embroidery::{process_pattern, process_pattern_from_path, PatternResult, ProcessingConfig};
use pdf_export::PdfExportPayload;
use project_hub::commands::{
    get_all_projects, init_project_hub, load_project, save_project, ProjectStoreLock,
};
use rfd::FileDialog;
use selection::{init_workspace, magic_wand_click, refine_mask, MagicWandParams, RefinementParams};
use serde::Deserialize;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use std::time::{SystemTime, UNIX_EPOCH};

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
fn desktop_select_open_path(title: Option<String>, filters: Vec<DialogFilter>) -> Option<String> {
    let mut dialog = FileDialog::new();
    if let Some(title) = title {
        dialog = dialog.set_title(&title);
    }

    for filter in filters {
        let extensions: Vec<&str> = filter.extensions.iter().map(String::as_str).collect();
        dialog = dialog.add_filter(&filter.name, &extensions);
    }

    dialog
        .pick_file()
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
fn desktop_read_file(path: String) -> Result<Vec<u8>, String> {
    fs::read(path).map_err(|err| err.to_string())
}

#[tauri::command]
fn desktop_file_exists(path: String) -> bool {
    Path::new(&path).exists()
}

#[tauri::command]
fn desktop_write_file(path: String, contents: Vec<u8>) -> Result<(), String> {
    let path_ref = Path::new(&path);
    if let Some(parent) = path_ref.parent() {
        fs::create_dir_all(parent).map_err(|err| err.to_string())?;
    }

    let stamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis())
        .unwrap_or(0);
    let temp_name = format!(
        ".{}.{}.tmp",
        path_ref
            .file_name()
            .and_then(|v| v.to_str())
            .unwrap_or("magpie-write"),
        stamp
    );
    let temp_path = path_ref.with_file_name(temp_name);
    fs::write(&temp_path, contents).map_err(|err| err.to_string())?;

    fs::rename(&temp_path, path_ref).or_else(|rename_err| {
        if path_ref.exists() {
            fs::remove_file(path_ref).map_err(|err| err.to_string())?;
            fs::rename(&temp_path, path_ref).map_err(|err| err.to_string())
        } else {
            Err(rename_err.to_string())
        }
    })
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

#[tauri::command]
fn export_pattern_pdf(payload: PdfExportPayload) -> Result<Vec<u8>, String> {
    pdf_export::export_pattern_pdf(&payload)
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

#[tauri::command]
fn init_selection_workspace(
    image_rgba: Vec<u8>,
    width: u32,
    height: u32,
    workspace_id: String,
) -> Result<(u32, u32), String> {
    init_workspace(&image_rgba, width, height, workspace_id)
}

#[tauri::command]
fn magic_wand_click_command(
    workspace_id: String,
    params: MagicWandParams,
) -> Result<Vec<u8>, String> {
    magic_wand_click(&workspace_id, &params)
}

#[tauri::command]
fn refine_selection(
    mask: Vec<u8>,
    width: u32,
    height: u32,
    params: RefinementParams,
) -> Result<Vec<u8>, String> {
    Ok(refine_mask(&mask, width, height, &params))
}

#[tauri::command]
fn compute_pattern_regions(
    payload: regions::RegionExtractionPayload,
) -> Result<Vec<regions::PatternRegion>, String> {
    regions::extract_regions_cached(&payload)
}

#[tauri::command]
async fn process_image(
    app: tauri::AppHandle,
    image_data: Vec<u8>,
    color_count: u8,
    detail_level: f32,
    hoop_config: image_processor::HoopConfig,
) -> Result<image_processor::RegionData, String> {
    tauri::async_runtime::spawn_blocking(move || {
        image_processor::process_image_pipeline(
            &app,
            image_data,
            color_count,
            detail_level,
            hoop_config,
        )
    })
    .await
    .map_err(|e| format!("Image processing task failed: {}", e))?
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(ProjectStoreLock(Mutex::new(())))
        .invoke_handler(tauri::generate_handler![
            desktop_select_save_path,
            desktop_select_open_path,
            desktop_select_folder,
            desktop_read_file,
            desktop_file_exists,
            desktop_write_file,
            desktop_open_in_folder,
            export_pattern_pdf,
            process_embroidery_pattern,
            process_embroidery_pattern_from_file,
            init_selection_workspace,
            magic_wand_click_command,
            refine_selection,
            compute_pattern_regions,
            process_image,
            get_all_projects,
            save_project,
            load_project,
        ])
        .setup(|app| {
            init_project_hub(&app.handle())?;
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
