use std::io::{ BufRead, BufReader };
use std::process::{ Stdio, Command };

use tauri::Manager;
use tauri::{
    plugin::{ Builder, TauriPlugin },
    Runtime
};

use rand::{ distributions::Alphanumeric, Rng };
fn gen_log_str() -> String {
    return format!("java_logger_{}", rand::thread_rng()
        .sample_iter(&Alphanumeric)
        .take(8)
        .map(char::from)
        .collect::<String>());
}

#[derive(Clone, serde::Serialize)]
struct LogPayload {
    r#type: String,
    data: String
}

#[tauri::command]
fn launch<R: Runtime>(
    app_handle: tauri::AppHandle<R>,
    class: String,
    jvm_args: Vec<String>,
    game_args: Vec<String>,
    directory: String,
    java_path: String
) -> String {
    let logger = gen_log_str();
    let _logger = logger.clone();
    std::thread::spawn(move || {
        let mut child = Command::new(java_path)
            .args(jvm_args)
            .arg(class)
            .args(game_args)
            .current_dir(directory)
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .spawn()
            .expect("failed to run child program");
        BufReader::new(child.stdout.take().unwrap())
            .lines()
            .filter_map(| line | line.ok())
            .for_each(| line | {
                let result = app_handle.emit_all(&_logger, LogPayload {
                    r#type: "out".into(),
                    data: line.into()
                });
                if !result.is_ok() {
                    println!("failed to log to window (out): {}", result.unwrap_err());
                }
            });
        BufReader::new(child.stderr.take().unwrap())
            .lines()
            .filter_map(| line | line.ok())
            .for_each(| line | {
                let result = app_handle.emit_all(&_logger, LogPayload {
                    r#type: "err".into(),
                    data: line.into()
                });
                if !result.is_ok() {
                    println!("failed to log to window (err): {}", result.unwrap_err());
                }
            });
        std::thread::spawn(move || {
            child.wait().unwrap();
            app_handle.emit_all(&_logger, LogPayload {
                r#type: "exit".into(),
                data: "".into()
            }).unwrap();
        });
    });
    return logger;
}

use std::fs;
use std::io::Read;
use std::path::Path;
use flate2::read::GzDecoder;

#[derive(Clone, serde::Serialize)]
pub struct Mod {
    name: String,
    path: String,
    icon: Option<Vec<u8>>,
    meta: Option<String>,
    meta_name: Option<String>
}

fn read_mod(path: &Path) -> Result<Mod, String> {
    let file = std::fs::File::open(path);
    if file.is_ok() {
        let archiv = zip::ZipArchive::new(file.as_ref().unwrap());
        if archiv.is_ok() {
            let mut archive = archiv.unwrap();
            let mut data = Mod {
                name: path.file_name().unwrap().to_str().unwrap().to_string(),
                path: path.to_str().unwrap().to_string(),
                icon: None,
                meta: None,
                meta_name: None
            };

            for i in 0..archive.len() {
                let mut file2 = archive.by_index(i).unwrap();
                let name = file2.name().to_string();
                if name == "fabric.mod.json" || name.contains("mods.toml") {
                    let mut buf = String::new();
                    file2.read_to_string(&mut buf).unwrap();

                    data.meta = Some(buf);
                    data.meta_name = Some(name);
                } else if name.contains("icon.png") || name.contains("logo.png") {
                    let mut buf = Vec::new();
                    file2.read_to_end(&mut buf).unwrap();

                    data.icon = Some(buf);
                }
            }

            return Ok(data);
        }
        return Err(archiv.unwrap_err().to_string());
    }
    return Err(file.unwrap_err().to_string());
}

#[tauri::command]
fn read_mods(path: String) -> Vec<Mod> {
    let mut mods = Vec::new();
    for path in fs::read_dir(path).unwrap() {
        let meta = read_mod(path.unwrap().path().as_path());
        if meta.is_ok() {
            mods.push(meta.unwrap());
        }
    }

    return mods;
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
fn extract_archive_contains<R: Runtime>(app_handle: tauri::AppHandle<R>, id: String, target: String, path: String, contains: String) {
    tauri::async_runtime::spawn(async move {
        fs::create_dir_all(Path::new(&path)).unwrap();

        let file = std::fs::File::open(target).unwrap();
        let mut archive = zip::ZipArchive::new(file).unwrap();
        app_handle.emit_all("download_update", DownloadPayload {
            id: id.to_string(),
            total: 2,
            progress: 1
        }).unwrap();

        for i in 0..archive.len() {
            let mut file = archive.by_index(i).unwrap();
            if !file.enclosed_name().unwrap().to_str().unwrap().contains(&*contains) {
                continue;
            }
            let concat = format!(
                "{}/{}",
                path,
                file.enclosed_name()
                    .unwrap()
                    .to_str()
                    .unwrap()
                    .replace(&*path, "")
            );
            let outpath = std::path::Path::new(&concat);
    
            if (&*file.name()).ends_with('/') {
                std::fs::create_dir_all(&*outpath).unwrap();
            } else {
                if let Some(p) = outpath.parent() {
                    if !p.exists() {
                        std::fs::create_dir_all(&p).unwrap();
                    }
                }
                let mut outfile = std::fs::File::create(&outpath).unwrap();
                std::io::copy(&mut file, &mut outfile).unwrap();
            }
        }

        app_handle.emit_all("download_update", DownloadPayload {
            id: id.to_string(),
            total: 2,
            progress: 2
        }).unwrap();
    });
}

use std::collections::HashMap;

#[tauri::command]
fn files_exist(files: Vec<String>) -> HashMap<String, bool> {
    let mut results = HashMap::new();
    for path in &files {
        results.insert(path.to_string(), Path::new(path).exists());
    }

    results
}

pub fn init<R: Runtime>() -> TauriPlugin<R> {
    Builder::new("voxura")
    .invoke_handler(tauri::generate_handler![
        launch,
        read_mods,
        files_exist,
        download_file,
        extract_archive,
        extract_archive_contains
    ])
    .build()
}