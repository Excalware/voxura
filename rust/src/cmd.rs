use std::io::Write;
use std::fs::File;
use std::path::Path;
use zip::write::FileOptions;
use tauri::Runtime;
use super::{ storage };
use serde_json::{ Value };

#[tauri::command]
pub fn storage_set<R: Runtime>(app: tauri::AppHandle<R>, key: String, value: Value) -> Result<(), String> {
	storage::storage_set(app, key, value)
}

#[tauri::command]
pub fn storage_get<R: Runtime>(app: tauri::AppHandle<R>, key: String, default: Value) -> Result<Value, String> {
	storage::storage_get(app, key, default)
}

#[tauri::command]
pub fn export_instance(files: Vec<String>, out: String) {
	if let Ok(file) = File::create(out) {
		let mut zip = zip::ZipWriter::new(file);
		
	}
}