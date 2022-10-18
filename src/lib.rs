use std::io::{ BufRead, BufReader };
use std::process::Stdio;
use tauri::Manager;

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
pub fn voxura_launch(app_handle: tauri::AppHandle, cwd: String, java_path: String, args: Vec<String>) -> String {
    let logger = gen_log_str();
    let _logger = logger.clone();
    std::thread::spawn(move || {
        let mut child = child_runner::run(&java_path, &args.join(" "), &cwd, Stdio::piped(), Stdio::piped());
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
pub fn voxura_read_mods(path: String) -> Vec<Mod> {
    let mut mods = Vec::new();
    for path in fs::read_dir(path).unwrap() {
        let meta = read_mod(path.unwrap().path().as_path());
        if meta.is_ok() {
            mods.push(meta.unwrap());
        }
    }

    return mods;
}

#[cfg(windows)]
mod child_runner {
    use std::str;
    use std::process::{ Command, Stdio };
    use std::os::windows::process::CommandExt;
    pub fn run (program: &str, arguments: &str, cwd: &str, out: Stdio, err: Stdio) -> std::process::Child {
        let launcher = "powershell.exe";
        let build_string: String;
        {
            if arguments.trim() == "" {
                build_string = format!(r#"& '{}'"#,program);
            }
            else {
                let mut arguments_reformatting: Vec<&str> = Vec::new();
                for argument in arguments.split(" ") {
                    arguments_reformatting.push(argument);
                }
                let arguments_reformatted = arguments_reformatting.join("','");
                build_string = format!(r#"& '{}' @('{}')"#,program,arguments_reformatted);
            }
        }

        Command::new(launcher)
            .creation_flags(0x08000000)
            .current_dir(cwd)
            .args(&[build_string])
            .stdout(out)
            .stderr(err)
            .spawn()
            .expect("failed to run child program")
    }
}