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