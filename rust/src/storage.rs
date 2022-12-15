use std::fs;
use std::path::PathBuf;
use tauri::Runtime;
use serde_json::{ Map, Value };

pub fn storage_set<R: Runtime>(app: tauri::AppHandle<R>, key: String, value: Value) -> Result<(), String> {
	let path = get_storage_path(app.clone())?;
	let mut storage = read_storage(path.clone())?;
	storage.insert(key, value);

	fs::write(path, serde_json::to_string(&storage).map_err(|_| "parse error")?).map_err(|_| "write error")?;
	Ok(())
}

pub fn storage_get<R: Runtime>(app: tauri::AppHandle<R>, key: String, default: Value) -> Result<Value, String> {
	let path = get_storage_path(app.clone())?;
	match read_storage(path)?.get(&key) {
		Some(x) => Ok(x.to_owned()),
		None => Ok(default)
	}
}

fn read_storage(path: PathBuf) -> Result<Map<String, Value>, String> {
	match fs::read_to_string(path) {
		Ok(x) => match serde_json::from_str(&x) {
			Ok(x) => Ok(x),
			_ => Ok(Map::new())
		},
		_ => Ok(Map::new())
	}
}

fn get_storage_path<R: Runtime>(app: tauri::AppHandle<R>) -> Result<PathBuf, String> {
	match app.path_resolver().app_data_dir() {
		Some(x) => Ok(x.join("voxura.storage.json")),
		None => Err("no path?".into())
	}
}