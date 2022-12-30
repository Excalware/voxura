use tauri::Manager;
use tauri::{
    plugin::{ Builder, TauriPlugin },
    Runtime
};

pub mod cmd;
pub mod auth;
pub mod storage;

use std::fs;
use std::fs::{ File };
use std::io::Read;
use std::path::Path;
use std::collections::HashMap;
use serde::{Deserialize, Serialize};
use flate2::read::GzDecoder;
use serde_json::{ Map };

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

fn real_read_mod<R: Runtime>(app_handle: tauri::AppHandle<R>, path: &Path) -> Result<Mod, String> {
	let projects = storage::storage_get(app_handle, "projects".into(), serde_json::Value::Object(Map::new()));
	match File::open(path.canonicalize().map_err(|x| x.to_string())?) {
		Ok(file) => {
			match zip::ZipArchive::new(file) {
				Ok(mut archive) => {
					let mut data = Mod {
						md5: get_md5_hash(path)?,
						name: path.file_name().unwrap().to_str().unwrap().to_string(),
						path: path.to_str().unwrap().to_string(),
						icon: None,
						meta: None,
						meta_name: None
					};
					if let Ok(projects) = projects {
						match projects.get(&data.md5) {
							Some(x) => {
								let x: CachedProject = serde_json::from_value(x.to_owned()).unwrap();
								data.icon = x.cached_icon.clone();
								data.meta = x.cached_metadata.clone();
								data.meta_name = x.cached_metaname.clone();
							},
							_ => ()
						}
					}

					if data.meta.is_none() || data.icon.is_none() {
						for i in 0..archive.len() {
							let mut file2 = archive.by_index(i).unwrap();
							let name = file2.name().to_string();
							if data.meta.is_none() && (name == "fabric.mod.json" || name.contains("mods.toml")) {
								let mut buf = String::new();
								file2.read_to_string(&mut buf).unwrap();

								data.meta = Some(buf);
								data.meta_name = Some(name);
							} else if data.icon.is_none() && (name.contains("icon.png") || name.contains("logo.png")) {
								let mut buf = Vec::new();
								file2.read_to_end(&mut buf).unwrap();

								data.icon = Some(buf);
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
	real_read_mod(app_handle.clone(), Path::new(&path))
}

#[tauri::command]
fn read_mods<R: Runtime>(app_handle: tauri::AppHandle<R>, path: String) -> Vec<Mod> {
    let mut mods = Vec::new();
    for entry in fs::read_dir(path).unwrap() {
		match real_read_mod(app_handle.clone(), entry.unwrap().path().as_path()) {
			Ok(x) => mods.push(x),
			Err(x) => println!("{}", x)
		}
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
        let file = std::fs::File::open(&target).unwrap();
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

        let file = File::open(target).unwrap();
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
		cmd::storage_get,
		cmd::create_sym_link
    ])
    .build()
}