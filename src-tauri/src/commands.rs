//! Tauri command surface: frontend-callable handlers plus the DTO shapes
//! the frontend receives. DTOs are flattened string forms suitable for
//! rendering (POSIX-style paths, RFC3339 timestamps).
//!
//! Errors from internal modules are stringified at the boundary —
//! `Result<T, String>` is what serializes cleanly to the JS side.

use crate::appconfig::{self, AppConfig, Workspace};
use crate::discovery::{self, DiscoveredProject};
use crate::paths;
use serde::Serialize;
use std::path::PathBuf;
use std::sync::Mutex;
use std::time::UNIX_EPOCH;
use tauri::State;
use time::format_description::well_known::Rfc3339;

/// App-wide shared state. Held in a Tauri `State<AppState>` registered via
/// `.manage()` in `run()`.
pub struct AppState {
    pub config: Mutex<AppConfig>,
}

impl AppState {
    /// Load app config from disk; fall back to an empty default on error so
    /// the app still starts. A warning is logged via `tracing` if load fails.
    pub fn load() -> Self {
        let config = match appconfig::load() {
            Ok(c) => c,
            Err(e) => {
                tracing::warn!("failed to load app config, starting with defaults: {e}");
                AppConfig::default()
            }
        };
        Self {
            config: Mutex::new(config),
        }
    }
}

#[derive(Debug, Clone, Serialize)]
pub struct WorkspaceDto {
    pub id: String,
    pub name: String,
    /// Display form of the path (forward slashes on all platforms).
    pub path: String,
    pub added_at: String,
}

impl From<&Workspace> for WorkspaceDto {
    fn from(w: &Workspace) -> Self {
        Self {
            id: w.id.clone(),
            name: w.name.clone(),
            path: paths::display_path(&w.path),
            added_at: w.added_at.format(&Rfc3339).unwrap_or_default(),
        }
    }
}

#[derive(Debug, Clone, Serialize)]
pub struct DiscoveredProjectDto {
    pub slug: String,
    pub slug_dir: String,
    pub cwd: Option<String>,
    /// Most recent transcript mtime as Unix epoch milliseconds; `None` if no
    /// transcripts exist.
    pub last_active_unix_millis: Option<i64>,
    pub transcript_count: usize,
}

impl From<&DiscoveredProject> for DiscoveredProjectDto {
    fn from(p: &DiscoveredProject) -> Self {
        let last_active_unix_millis = p.last_active.map(|t| {
            t.duration_since(UNIX_EPOCH)
                .map(|d| d.as_millis() as i64)
                .unwrap_or(0)
        });
        Self {
            slug: p.slug.clone(),
            slug_dir: paths::display_path(&p.slug_dir),
            cwd: p.cwd.as_deref().map(paths::display_path),
            last_active_unix_millis,
            transcript_count: p.transcript_count,
        }
    }
}

#[tauri::command]
pub fn list_workspaces(state: State<'_, AppState>) -> Vec<WorkspaceDto> {
    let cfg = state.config.lock().expect("config mutex poisoned");
    cfg.workspaces.iter().map(WorkspaceDto::from).collect()
}

#[tauri::command]
pub fn add_workspace(
    state: State<'_, AppState>,
    path: String,
    name: Option<String>,
) -> Result<WorkspaceDto, String> {
    let path_buf = PathBuf::from(&path);
    // Canonicalize when possible so the stored path is stable; fall back
    // to the given path if canonicalize fails (e.g., dir doesn't exist yet).
    let canonical = std::fs::canonicalize(&path_buf).unwrap_or(path_buf);
    let dto = {
        let mut cfg = state.config.lock().expect("config mutex poisoned");
        let ws = cfg.add_workspace(canonical, name);
        WorkspaceDto::from(ws)
    };
    appconfig::save(&state.config.lock().expect("config mutex poisoned (save)"))
        .map_err(|e| e.to_string())?;
    Ok(dto)
}

#[tauri::command]
pub fn remove_workspace(state: State<'_, AppState>, id: String) -> Result<bool, String> {
    let (removed, snapshot) = {
        let mut cfg = state.config.lock().expect("config mutex poisoned");
        let removed = cfg.remove_workspace(&id);
        (removed, cfg.clone())
    };
    if removed {
        appconfig::save(&snapshot).map_err(|e| e.to_string())?;
    }
    Ok(removed)
}

#[tauri::command]
pub fn rename_workspace(
    state: State<'_, AppState>,
    id: String,
    name: String,
) -> Result<bool, String> {
    let (renamed, snapshot) = {
        let mut cfg = state.config.lock().expect("config mutex poisoned");
        let renamed = cfg.rename_workspace(&id, name);
        (renamed, cfg.clone())
    };
    if renamed {
        appconfig::save(&snapshot).map_err(|e| e.to_string())?;
    }
    Ok(renamed)
}

#[tauri::command]
pub fn discover_workspaces_from_history() -> Result<Vec<DiscoveredProjectDto>, String> {
    let projects = discovery::discover_projects().map_err(|e| e.to_string())?;
    Ok(projects.iter().map(DiscoveredProjectDto::from).collect())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::appconfig::Workspace;
    use time::OffsetDateTime;

    #[test]
    fn workspace_dto_shape_is_flat_strings() {
        let ws = Workspace {
            id: "abc123".into(),
            name: "alpha".into(),
            path: PathBuf::from("/work/alpha"),
            added_at: OffsetDateTime::from_unix_timestamp(1_700_000_000).unwrap(),
        };
        let dto = WorkspaceDto::from(&ws);
        assert_eq!(dto.id, "abc123");
        assert_eq!(dto.name, "alpha");
        assert_eq!(dto.path, "/work/alpha");
        assert!(dto.added_at.starts_with("2023-"), "got {}", dto.added_at);
    }

    #[test]
    fn discovered_project_dto_maps_none_fields() {
        let p = DiscoveredProject {
            slug: "-slug".into(),
            slug_dir: PathBuf::from("/tmp/x/-slug"),
            cwd: None,
            last_active: None,
            transcript_count: 0,
        };
        let dto = DiscoveredProjectDto::from(&p);
        assert_eq!(dto.slug, "-slug");
        assert!(dto.cwd.is_none());
        assert!(dto.last_active_unix_millis.is_none());
        assert_eq!(dto.transcript_count, 0);
    }
}
