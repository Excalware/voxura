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
pub fn launch(app_handle: tauri::AppHandle, cwd: String, java_path: String, args: Vec<String>) -> String {
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