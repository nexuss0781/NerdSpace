#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use std::time::SystemTime;

use serde::{Deserialize, Serialize};
use notify::Watcher;
use tauri::{AppHandle, Emitter, Manager, State};
use rfd::FileDialog;

const SETTINGS_FILE: &str = "settings.json";

/* -------------------------------------------------------------------------- */
/*  Data models                                                               */
/* -------------------------------------------------------------------------- */

#[derive(Debug, Serialize, Deserialize, Clone, Default)]
pub struct Settings {
    pub root_path: Option<String>,
    pub projects: HashMap<String, ProjectMeta>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ProjectMeta {
    pub name: String,
    pub website_url: Option<String>,
    pub created_at: i64,
}

#[derive(Debug, Serialize, Clone)]
pub struct FileEntry {
    pub name: String,
    pub path: String,
    pub kind: String, // "file" | "folder"
    pub size: u64,
    pub modified: Option<u64>,
}

#[derive(Debug, Serialize, Clone)]
pub struct FsChange {
    pub kind: String, // "create" | "modify" | "remove" | "rename" | "other"
    pub paths: Vec<String>,
}

/* -------------------------------------------------------------------------- */
/*  App state                                                                 */
/* -------------------------------------------------------------------------- */

pub struct AppState {
    pub watcher: Mutex<Option<notify::RecommendedWatcher>>,
}

/* -------------------------------------------------------------------------- */
/*  Path helpers                                                              */
/* -------------------------------------------------------------------------- */

fn config_dir(_app: &AppHandle) -> Result<PathBuf, String> {
    let home = std::env::var("HOME")
        .or_else(|_| std::env::var("USERPROFILE"))
        .map_err(|_| "could not resolve home directory".to_string())?;
    #[cfg(target_os = "macos")]
    let suffix = "Library/Application Support/nexus-desktop";
    #[cfg(not(target_os = "macos"))]
    let suffix = ".config/nexus-desktop";
    Ok(PathBuf::from(home).join(suffix))
}

fn app_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = config_dir(app)?.join("nexus-desktop");
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir)
}

fn settings_path(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(app_dir(app)?.join(SETTINGS_FILE))
}

fn load_settings(app: &AppHandle) -> Result<Settings, String> {
    let path = settings_path(app)?;
    if !path.exists() {
        return Ok(Settings::default());
    }
    let data = fs::read_to_string(&path).map_err(|e| e.to_string())?;
    serde_json::from_str(&data).map_err(|e| e.to_string())
}

fn save_settings(app: &AppHandle, settings: &Settings) -> Result<(), String> {
    let path = settings_path(app)?;
    let data = serde_json::to_string_pretty(settings).map_err(|e| e.to_string())?;
    fs::write(&path, data).map_err(|e| e.to_string())
}

fn now_ts() -> i64 {
    SystemTime::now()
        .duration_since(SystemTime::UNIX_EPOCH)
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0)
}

/* -------------------------------------------------------------------------- */
/*  Commands                                                                  */
/* -------------------------------------------------------------------------- */

#[tauri::command]
fn get_settings(app: AppHandle) -> Result<Settings, String> {
    load_settings(&app)
}

#[tauri::command]
async fn select_root_folder() -> Result<Option<String>, String> {
    let folder = FileDialog::new().pick_folder();
    Ok(folder.map(|p| p.to_string_lossy().to_string()))
}

#[tauri::command]
fn set_root_folder(app: AppHandle, root_path: String) -> Result<Settings, String> {
    let root = PathBuf::from(&root_path);
    if !root.is_dir() {
        return Err(format!("not a directory: {}", root_path));
    }

    let mut settings = load_settings(&app)?;
    settings.root_path = Some(root_path.clone());

    // Import every immediate subfolder as a project (idempotent).
    if let Ok(entries) = fs::read_dir(&root) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_dir() {
                let key = path.to_string_lossy().to_string();
                settings
                    .projects
                    .entry(key)
                    .or_insert_with(|| ProjectMeta {
                        name: path
                            .file_name()
                            .and_then(|n| n.to_str())
                            .unwrap_or("project")
                            .to_string(),
                        website_url: None,
                        created_at: now_ts(),
                    });
            }
        }
    }

    save_settings(&app, &settings)?;
    Ok(settings)
}

#[tauri::command]
fn create_project(
    app: AppHandle,
    root_path: String,
    name: String,
) -> Result<Settings, String> {
    let root = PathBuf::from(&root_path);
    if !root.is_dir() {
        return Err("root folder is not set".to_string());
    }
    let safe_name = name
        .trim()
        .chars()
        .filter(|c| c.is_alphanumeric() || *c == '-' || *c == '_' || *c == ' ')
        .collect::<String>();
    if safe_name.trim().is_empty() {
        return Err("invalid project name".to_string());
    }
    let project_path = root.join(&safe_name);
    if project_path.exists() {
        return Err(format!("project already exists: {}", safe_name));
    }
    fs::create_dir_all(&project_path).map_err(|e| e.to_string())?;

    let mut settings = load_settings(&app)?;
    let key = project_path.to_string_lossy().to_string();
    settings.projects.insert(
        key.clone(),
        ProjectMeta {
            name: safe_name,
            website_url: None,
            created_at: now_ts(),
        },
    );
    save_settings(&app, &settings)?;
    Ok(settings)
}

#[tauri::command]
fn delete_project(app: AppHandle, path: String) -> Result<Settings, String> {
    let p = PathBuf::from(&path);
    if p.is_dir() {
        fs::remove_dir_all(&p).map_err(|e| e.to_string())?;
    }
    let mut settings = load_settings(&app)?;
    settings.projects.remove(&path);
    save_settings(&app, &settings)?;
    Ok(settings)
}

#[tauri::command]
fn rename_project(app: AppHandle, old_path: String, new_name: String) -> Result<Settings, String> {
    let old = PathBuf::from(&old_path);
    if !old.exists() {
        return Err("project does not exist".to_string());
    }
    let safe_name = new_name
        .trim()
        .chars()
        .filter(|c| c.is_alphanumeric() || *c == '-' || *c == '_' || *c == ' ')
        .collect::<String>();
    if safe_name.trim().is_empty() {
        return Err("invalid project name".to_string());
    }
    let parent = old.parent().ok_or_else(|| "no parent".to_string())?;
    let new_path = parent.join(&safe_name);
    if new_path.exists() {
        return Err(format!("already exists: {}", safe_name));
    }
    fs::rename(&old, &new_path).map_err(|e| e.to_string())?;

    let mut settings = load_settings(&app)?;
    if let Some(meta) = settings.projects.remove(&old_path) {
        let key = new_path.to_string_lossy().to_string();
        settings.projects.insert(key, meta);
    }
    save_settings(&app, &settings)?;
    Ok(settings)
}

#[tauri::command]
fn set_project_website(
    app: AppHandle,
    path: String,
    website_url: Option<String>,
) -> Result<Settings, String> {
    let mut settings = load_settings(&app)?;
    if let Some(meta) = settings.projects.get_mut(&path) {
        meta.website_url = website_url;
    } else {
        settings.projects.insert(
            path.clone(),
            ProjectMeta {
                name: PathBuf::from(&path)
                    .file_name()
                    .and_then(|n| n.to_str())
                    .unwrap_or("project")
                    .to_string(),
                website_url,
                created_at: now_ts(),
            },
        );
    }
    save_settings(&app, &settings)?;
    Ok(settings)
}

#[tauri::command]
fn list_projects(app: AppHandle) -> Result<Settings, String> {
    load_settings(&app)
}

#[tauri::command]
fn list_entries(dir_path: String) -> Result<Vec<FileEntry>, String> {
    let dir = PathBuf::from(&dir_path);
    if !dir.is_dir() {
        return Err("not a directory".to_string());
    }
    let mut entries: Vec<FileEntry> = Vec::new();
    for entry in fs::read_dir(&dir).map_err(|e| e.to_string())? {
        let entry = entry.map_err(|e| e.to_string())?;
        let path = entry.path();
        let meta = entry.metadata().map_err(|e| e.to_string())?;
        let name = path
            .file_name()
            .and_then(|n| n.to_str())
            .unwrap_or("")
            .to_string();
        let kind = if meta.is_dir() { "folder" } else { "file" };
        let modified = meta
            .modified()
            .ok()
            .and_then(|t| t.duration_since(SystemTime::UNIX_EPOCH).ok())
            .map(|d| d.as_secs());
        entries.push(FileEntry {
            name,
            path: path.to_string_lossy().to_string(),
            kind: kind.to_string(),
            size: meta.len(),
            modified,
        })
    }
    // folders first, then files, alphabetical
    entries.sort_by(|a, b| {
        let ak = (a.kind != "folder", a.name.to_lowercase());
        let bk = (b.kind != "folder", b.name.to_lowercase());
        ak.cmp(&bk)
    });
    Ok(entries)
}

#[tauri::command]
fn read_file(path: String) -> Result<String, String> {
    let p = PathBuf::from(&path);
    fs::read_to_string(&p).map_err(|e| e.to_string())
}

#[tauri::command]
fn write_file(args: WriteFileArgs) -> Result<(), String> {
    fs::write(&args.path, &args.content).map_err(|e| e.to_string())
}

#[derive(Deserialize)]
struct WriteFileArgs {
    path: String,
    content: String,
}

#[tauri::command]
fn create_file(dir_path: String, name: String, content: Option<String>) -> Result<(), String> {
    let dir = PathBuf::from(&dir_path);
    if !dir.is_dir() {
        return Err("not a directory".to_string());
    }
    let path = dir.join(&name);
    if path.exists() {
        return Err("file already exists".to_string());
    }
    let content = content.unwrap_or_default();
    fs::write(&path, content).map_err(|e| e.to_string())
}

#[tauri::command]
fn create_folder(dir_path: String, name: String) -> Result<(), String> {
    let dir = PathBuf::from(&dir_path);
    if !dir.is_dir() {
        return Err("not a directory".to_string());
    }
    let path = dir.join(&name);
    if path.exists() {
        return Err("folder already exists".to_string());
    }
    fs::create_dir_all(&path).map_err(|e| e.to_string())
}

#[tauri::command]
fn delete_file(path: String) -> Result<(), String> {
    let p = PathBuf::from(&path);
    if p.is_dir() {
        fs::remove_dir_all(&p).map_err(|e| e.to_string())?;
    } else {
        fs::remove_file(&p).map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
fn rename_file(old_path: String, new_path: String) -> Result<(), String> {
    fs::rename(&old_path, &new_path).map_err(|e| e.to_string())
}

/* -------------------------------------------------------------------------- */
/*  Filesystem watcher (real-time)                                            */
/* -------------------------------------------------------------------------- */

#[tauri::command]
fn start_watching(app: AppHandle, state: State<'_, AppState>) -> Result<(), String> {
    let settings = load_settings(&app)?;
    let root = match &settings.root_path {
        Some(r) => r.clone(),
        None => return Err("no root folder selected".to_string()),
    };

    let (tx, mut rx) = std::sync::mpsc::channel();
    let mut watcher = notify::RecommendedWatcher::new(tx, notify::Config::default())
        .map_err(|e| e.to_string())?;
    watcher
        .watch(Path::new(&root), notify::RecursiveMode::Recursive)
        .map_err(|e| e.to_string())?;

    // Keep the watcher alive for the lifetime of the app.
    *state.watcher.lock().unwrap() = Some(watcher);

    let app_clone = app.clone();
    std::thread::spawn(move || {
        while let Ok(res) = rx.recv() {
            match res {
                Ok(events) => {
                    let mut paths: Vec<String> = Vec::new();
                    let mut kind = "other".to_string();
                    for e in &events {
                        for p in &e.paths {
                            paths.push(p.to_string_lossy().to_string());
                        }
                    }
                    if !paths.is_empty() {
                        // heuristically label the change kind
                        if events.iter().any(|e| !e.kind.is_modify()) {
                            kind = "change".to_string();
                        }
                        let _ = app_clone.emit(
                            "fs-change",
                            FsChange { kind, paths },
                        );
                    }
                }
                Err(e) => {
                    let _ = app_clone.emit("fs-error", e.to_string());
                }
            }
        }
    });

    Ok(())
}

/* -------------------------------------------------------------------------- */
/*  Tauri app                                                                 */
/* -------------------------------------------------------------------------- */

fn main() {
    tauri::Builder::default()
        .manage(AppState {
            watcher: Mutex::new(None),
        })
        .invoke_handler(tauri::generate_handler![
            get_settings,
            select_root_folder,
            set_root_folder,
            create_project,
            delete_project,
            rename_project,
            set_project_website,
            list_projects,
            list_entries,
            read_file,
            write_file,
            create_file,
            create_folder,
            delete_file,
            rename_file,
            start_watching,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
