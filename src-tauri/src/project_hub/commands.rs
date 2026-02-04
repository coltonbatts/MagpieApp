use std::fs;
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use std::time::{SystemTime, UNIX_EPOCH};

use tauri::{AppHandle, Manager, State};

use super::models::{ManifestEntry, ProjectDocument, ProjectsManifest};

pub struct ProjectStoreLock(pub Mutex<()>);

fn app_root(app: &AppHandle) -> Result<PathBuf, String> {
    let app_data = app
        .path()
        .app_data_dir()
        .map_err(|err| format!("Failed to resolve app data directory: {err}"))?;
    Ok(app_data.join("Magpie"))
}

fn projects_root(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(app_root(app)?.join("Magpie Projects"))
}

fn manifest_path(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(app_root(app)?.join("projects_manifest.json"))
}

fn validate_project_id(project_id: &str) -> Result<(), String> {
    if project_id.is_empty() {
        return Err("project_id cannot be empty".to_string());
    }
    if project_id
        .chars()
        .all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_')
    {
        return Ok(());
    }
    Err("project_id contains unsupported characters".to_string())
}

fn project_doc_path(app: &AppHandle, project_id: &str) -> Result<PathBuf, String> {
    validate_project_id(project_id)?;
    Ok(projects_root(app)?.join(project_id).join("project.json"))
}

fn ensure_project_layout(app: &AppHandle) -> Result<(), String> {
    let root = app_root(app)?;
    let projects = projects_root(app)?;

    fs::create_dir_all(&root).map_err(|err| format!("Could not create root dir: {err}"))?;
    fs::create_dir_all(&projects).map_err(|err| format!("Could not create projects dir: {err}"))?;

    let manifest = manifest_path(app)?;
    if !manifest.exists() {
        let initial = serde_json::to_string_pretty(&ProjectsManifest::default())
            .map_err(|err| format!("Could not serialize initial manifest: {err}"))?;
        fs::write(manifest, initial).map_err(|err| format!("Could not create manifest: {err}"))?;
    }

    Ok(())
}

fn read_manifest(app: &AppHandle) -> Result<ProjectsManifest, String> {
    ensure_project_layout(app)?;
    let raw = fs::read_to_string(manifest_path(app)?).map_err(|err| err.to_string())?;
    serde_json::from_str::<ProjectsManifest>(&raw).map_err(|err| err.to_string())
}

fn write_manifest(app: &AppHandle, manifest: &ProjectsManifest) -> Result<(), String> {
    let payload = serde_json::to_string_pretty(manifest).map_err(|err| err.to_string())?;
    fs::write(manifest_path(app)?, payload).map_err(|err| err.to_string())
}

fn normalize_path_string(path: &str) -> Result<String, String> {
    let normalized = Path::new(path)
        .components()
        .collect::<PathBuf>()
        .to_string_lossy()
        .to_string();
    if normalized.is_empty() {
        return Err("reference_image_path cannot be empty".to_string());
    }
    Ok(normalized)
}

fn now_timestamp() -> String {
    let millis = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis())
        .unwrap_or(0);
    millis.to_string()
}

#[tauri::command]
pub fn get_all_projects(
    app: AppHandle,
    lock: State<'_, ProjectStoreLock>,
) -> Result<Vec<ManifestEntry>, String> {
    let _guard = lock
        .0
        .lock()
        .map_err(|_| "Project lock poisoned".to_string())?;
    let mut manifest = read_manifest(&app)?;
    manifest
        .projects
        .sort_by(|a, b| b.last_modified.cmp(&a.last_modified));
    Ok(manifest.projects)
}

#[tauri::command]
pub fn load_project(
    app: AppHandle,
    project_id: String,
    lock: State<'_, ProjectStoreLock>,
) -> Result<ProjectDocument, String> {
    let _guard = lock
        .0
        .lock()
        .map_err(|_| "Project lock poisoned".to_string())?;
    ensure_project_layout(&app)?;

    let path = project_doc_path(&app, &project_id)?;
    let raw = fs::read_to_string(path).map_err(|err| err.to_string())?;
    serde_json::from_str::<ProjectDocument>(&raw).map_err(|err| err.to_string())
}

#[tauri::command]
pub fn save_project(
    app: AppHandle,
    mut project: ProjectDocument,
    lock: State<'_, ProjectStoreLock>,
) -> Result<(), String> {
    let _guard = lock
        .0
        .lock()
        .map_err(|_| "Project lock poisoned".to_string())?;
    ensure_project_layout(&app)?;

    validate_project_id(&project.project_id)?;
    project.reference_image_path = normalize_path_string(&project.reference_image_path)?;
    if project.last_modified.trim().is_empty() {
        project.last_modified = now_timestamp();
    }
    if project.created_date.trim().is_empty() {
        project.created_date = project.last_modified.clone();
    }

    let project_path = project_doc_path(&app, &project.project_id)?;
    if let Some(parent) = project_path.parent() {
        fs::create_dir_all(parent).map_err(|err| err.to_string())?;
    }

    let payload = serde_json::to_string_pretty(&project).map_err(|err| err.to_string())?;
    fs::write(project_path, payload).map_err(|err| err.to_string())?;

    let mut manifest = read_manifest(&app)?;
    let next_entry = ManifestEntry {
        project_id: project.project_id.clone(),
        project_name: project.project_name.clone(),
        created_date: project.created_date.clone(),
        last_modified: project.last_modified.clone(),
        reference_image_path: project.reference_image_path.clone(),
        thumbnail_path: project.thumbnail_path.clone(),
    };

    if let Some(existing) = manifest
        .projects
        .iter_mut()
        .find(|item| item.project_id == project.project_id)
    {
        *existing = next_entry;
    } else {
        manifest.projects.push(next_entry);
    }
    manifest
        .projects
        .sort_by(|a, b| b.last_modified.cmp(&a.last_modified));

    write_manifest(&app, &manifest)
}

pub fn init_project_hub(app: &AppHandle) -> Result<(), String> {
    ensure_project_layout(app)
}
