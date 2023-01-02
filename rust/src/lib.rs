use tauri::Manager;
use tauri::{
    plugin::{ Builder, TauriPlugin },
    Runtime
};

pub mod cmd;
pub mod auth;
pub mod storage;

use std::fs;
use std::fs::File;
use std::io::Read;
use std::path::Path;
use std::thread;
use zip::ZipArchive;
use std::collections::HashMap;
use serde::{Deserialize, Serialize};
use flate2::read::GzDecoder;
use serde_json::{ Map, Value };

#[derive(Clone, serde::Serialize)]
pub struct Mod {
	md5: String,
    name: String,
    path: String,
    icon: Option<Vec<u8>>,
    meta: Option<String>,
    meta_name: Option<String>
}

#[derive(Serialize, Deserialize)]
pub struct CachedProject {
	id: String,
	version: String,
	platform: String,
	cached_icon: Option<Vec<u8>>,
	cached_metaname: Option<String>,
	cached_metadata: Option<String>
}

// the worst thing you've ever seen
fn real_read_mod(path: &Path, projects: &Map<String, Value>) -> Result<Mod, String> {
	match File::open(path.canonicalize().map_err(|x| x.to_string())?) {
		Ok(file) => {
			let mut data = Mod {
				md5: get_md5_hash(path)?,
				name: path.file_name().unwrap().to_str().unwrap().to_string(),
				path: path.to_str().unwrap().to_string(),
				icon: None,
				meta: None,
				meta_name: None
			};
			match projects.get(&data.md5) {
				Some(x) => {
					let x: CachedProject = serde_json::from_value(x.to_owned()).unwrap();
					data.icon = x.cached_icon.clone();
					data.meta = x.cached_metadata.clone();
					data.meta_name = x.cached_metaname.clone();
				},
				_ => ()
			}
			if data.icon.is_some() && data.meta.is_some() && data.meta_name.is_some() {
				return Ok(data);
			}
			match ZipArchive::new(file) {
				Ok(mut archive) => {
					if data.meta.is_none() {
						for name in vec!["quilt.mod.json", "fabric.mod.json", "META-INF/mods.toml"] {
							if let Ok(mut file) = archive.by_name(&name) {
								let mut string = String::new();
								file.read_to_string(&mut string).unwrap();

								data.meta = Some(string);
								data.meta_name = Some(name.to_string());
								break;
							}
						}
					}
					if data.icon.is_none() {
						for name in vec!["icon.png", "logo.png"] {
							if let Ok(mut file) = archive.by_name(&name) {
								let mut buffer = vec![];
								file.read_to_end(&mut buffer).unwrap();

								data.icon = Some(buffer);
								break;
							}
						}
					}
					Ok(data)
				},
				Err(x) => Err(x.to_string())
			}
		},
		Err(x) => Err(x.to_string())
    }
}

#[tauri::command]
fn read_mod<R: Runtime>(app_handle: tauri::AppHandle<R>, path: String) -> Result<Mod, String> {
	let projects = storage::storage_get(app_handle, "projects".into(), serde_json::Value::Object(Map::new())).unwrap().as_object().unwrap().to_owned();
	real_read_mod(Path::new(&path), &projects)
}

#[tauri::command]
fn read_mods<R: Runtime>(app_handle: tauri::AppHandle<R>, path: String) -> Vec<Mod> {
	let mut mods = vec![];
	let mut threads = vec![];
	if let Ok(dir) = fs::read_dir(path) {
		let projects = storage::storage_get(app_handle, "projects".into(), serde_json::Value::Object(Map::new())).unwrap().as_object().unwrap().to_owned();
		for entry in dir {
			let projects = projects.clone();
			if let Ok(entry) = entry {
				threads.push(thread::spawn(move ||
					real_read_mod(entry.path().as_path(), &projects).unwrap()
				));
			}
		}
	}
	for thread in threads {
		mods.push(thread.join().unwrap());
	}

    mods
}

#[derive(Clone, serde::Serialize)]
struct DownloadPayload {
    id: String,
    total: u64,
    progress: u64
}

use std::cmp::min;
use futures::StreamExt;

async fn download_file2<R: Runtime>(app_handle: tauri::AppHandle<R>, id: String, path: String, url: String) -> Result<(), reqwest::Error> {
    let client = reqwest::Client::new();
    let response = client.get(url).send().await?;

    let total_size = response.content_length().unwrap();
    let mut downloaded: u64 = 0;
    let mut stream = response.bytes_stream();

    let mut last_emit = 0;
    let mut buffer = Vec::new();
    while let Some(chunk) = stream.next().await {
        let chunk = chunk?;
        buffer.extend(chunk.as_ref().to_vec());

        let progress = min(downloaded + (chunk.len() as u64), total_size);
        downloaded = progress;

        if progress - last_emit >= 100000 || progress == total_size {
            app_handle.emit_all("download_update", DownloadPayload {
                id: id.to_string(),
                total: total_size,
                progress
            }).unwrap();
            last_emit = progress;
        }
    }
    fs::create_dir_all(Path::new(&path).parent().unwrap()).unwrap();
    fs::write(path, buffer).unwrap();

    Ok(())
}

#[tauri::command]
fn download_file<R: Runtime>(app_handle: tauri::AppHandle<R>, id: String, path: String, url: String) {
    tauri::async_runtime::spawn(download_file2(app_handle, id, path, url));
}

#[tauri::command]
fn extract_archive<R: Runtime>(app_handle: tauri::AppHandle<R>, id: String, target: String, path: String) {
    tauri::async_runtime::spawn(async move {
        let path = Path::new(&path);
        if let Ok(file) = File::open(&target) {
			if target.ends_with(".zip") {
				let mut archive = zip::ZipArchive::new(file).unwrap();
				app_handle.emit_all("download_update", DownloadPayload {
					id: id.to_string(),
					total: 2,
					progress: 1
				}).unwrap();

				archive.extract(path).unwrap();
			} else if target.ends_with(".tar.gz") {
				let tar = GzDecoder::new(file);
				let mut archive = tar::Archive::new(tar);
				app_handle.emit_all("download_update", DownloadPayload {
					id: id.to_string(),
					total: 2,
					progress: 1
				}).unwrap();

				archive.unpack(path).unwrap();
			}
		}

        app_handle.emit_all("download_update", DownloadPayload {
            id: id.to_string(),
            total: 2,
            progress: 2
        }).unwrap();
    });
}

#[tauri::command]
fn extract_natives<R: Runtime>(app_handle: tauri::AppHandle<R>, id: String, target: String, path: String) {
    tauri::async_runtime::spawn(async move {
        fs::create_dir_all(&path).unwrap();

        if let Ok(file) = File::open(target) {
			let mut archive = zip::ZipArchive::new(file).unwrap();
			app_handle.emit_all("download_update", DownloadPayload {
				id: id.to_string(),
				total: 2,
				progress: 1
			}).unwrap();

			for i in 0..archive.len() {
				if let Ok(mut file) = archive.by_index(i) {
					if let Some(name) = file.enclosed_name() {
						if name.extension().filter(|e| e.to_str().unwrap() == "dll").is_some() {
							if let Ok(mut file2) = File::create(Path::new(&path).join(name.file_name().unwrap().to_str().unwrap())) {
								std::io::copy(&mut file, &mut file2).unwrap();
							}
						}
					}
				}
			}
		}

        app_handle.emit_all("download_update", DownloadPayload {
            id: id.to_string(),
            total: 2,
            progress: 2
        }).unwrap();
    });
}

#[tauri::command]
fn files_exist(files: Vec<String>) -> HashMap<String, bool> {
    let mut results = HashMap::new();
    for path in &files {
        results.insert(path.to_string(), Path::new(path).exists());
    }

    results
}

#[tauri::command]
fn request_microsoft_code() -> String {
	return auth::get_url().unwrap();
}

fn get_md5_hash(path: &Path) -> Result<String, String> {
	match fs::read(path) {
		Ok(x) => Ok(format!("{:x}", md5::compute(x))),
		Err(x) => Err(x.to_string())
	}
}

#[tauri::command]
fn get_file_md5(path: String) -> Result<String, String> {
	get_md5_hash(&Path::new(&path))
}

pub fn init<R: Runtime>() -> TauriPlugin<R> {
    Builder::new("voxura")
    .invoke_handler(tauri::generate_handler![
		read_mod,
        read_mods,
        files_exist,
		get_file_md5,
        download_file,
        extract_archive,
		extract_natives,
		request_microsoft_code,
		
		cmd::storage_set,
		cmd::storage_get
    ])
    .build()
}