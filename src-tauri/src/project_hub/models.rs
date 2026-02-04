use serde::{Deserialize, Serialize};
use serde_json::Value;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProjectSettings {
    pub pixel_size: u32,
    pub color_count: u16,
    pub floss_brand: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProjectDocument {
    pub project_id: String,
    pub project_name: String,
    pub created_date: String,
    pub last_modified: String,
    pub reference_image_path: String,
    pub settings: ProjectSettings,
    pub state: Value,
    pub thumbnail_path: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ManifestEntry {
    pub project_id: String,
    pub project_name: String,
    pub created_date: String,
    pub last_modified: String,
    pub reference_image_path: String,
    pub thumbnail_path: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProjectsManifest {
    pub version: u8,
    pub projects: Vec<ManifestEntry>,
}

impl Default for ProjectsManifest {
    fn default() -> Self {
        Self {
            version: 1,
            projects: Vec::new(),
        }
    }
}
