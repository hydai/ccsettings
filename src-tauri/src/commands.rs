//! Tauri command surface: frontend-callable handlers plus the DTO shapes
//! the frontend receives. DTOs are flattened string forms suitable for
//! rendering (POSIX-style paths, RFC3339 timestamps).
//!
//! Errors from internal modules are stringified at the boundary —
//! `Result<T, String>` is what serializes cleanly to the JS side.

use crate::appconfig::{self, AppConfig, Workspace};
use crate::backup::{self, BackupEntry};
use crate::cascade::{self, MergedView};
use crate::discovery::{self, DiscoveredProject};
use crate::layers::{self, Layer, LayerContent, LayerKind};
use crate::mcp;
use crate::paths::{self, WorkspacePaths};
use crate::plugins::{self, InstalledPlugin};
use crate::writers;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::BTreeMap;
use std::path::{Path, PathBuf};
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

/// Load all five settings-cascade tiers for the given workspace and return
/// the merged view. Absent or malformed layer files simply do not contribute
/// — the merge is best-effort and never fails on per-layer problems.
#[tauri::command]
pub fn get_cascade(state: State<'_, AppState>, workspace_id: String) -> Result<MergedView, String> {
    let workspace_path = {
        let cfg = state.config.lock().expect("config mutex poisoned");
        cfg.workspace(&workspace_id)
            .ok_or_else(|| format!("unknown workspace id: {workspace_id}"))?
            .path
            .clone()
    };
    let layers = load_workspace_layers(&workspace_path).map_err(|e| e.to_string())?;
    Ok(cascade::merge(&layers))
}

#[derive(Debug, Clone, Serialize)]
pub struct LayerFileDto {
    pub layer: LayerKind,
    pub path: String,
    pub exists: bool,
    /// Parsed JSON content when the file exists and parsed cleanly.
    pub content: Option<Value>,
    /// Parse error message when the file exists but is malformed.
    pub parse_error: Option<String>,
    /// Hex-encoded SHA-256 of the current on-disk bytes, or null if absent.
    pub hash: Option<String>,
}

impl LayerFileDto {
    fn from_layer(l: &Layer) -> Self {
        let (exists, content, parse_error) = match &l.content {
            LayerContent::Absent => (false, None, None),
            LayerContent::Parsed(v) => (true, Some(v.clone()), None),
            LayerContent::ParseError(m) => (true, None, Some(m.clone())),
        };
        Self {
            layer: l.kind,
            path: paths::display_path(&l.file),
            exists,
            content,
            parse_error,
            hash: l.hash.as_ref().map(|h| to_hex(h)),
        }
    }
}

/// Read a single settings tier for a workspace. Absent files return exists=false;
/// malformed files return exists=true with parse_error set.
#[tauri::command]
pub fn get_layer_content(
    state: State<'_, AppState>,
    workspace_id: String,
    layer: LayerKind,
) -> Result<LayerFileDto, String> {
    let workspace_path = {
        let cfg = state.config.lock().expect("config mutex poisoned");
        cfg.workspace(&workspace_id)
            .ok_or_else(|| format!("unknown workspace id: {workspace_id}"))?
            .path
            .clone()
    };
    let path = resolve_layer_path(&workspace_path, layer)?;
    let l = layers::load_layer(layer, path).map_err(|e| e.to_string())?;
    Ok(LayerFileDto::from_layer(&l))
}

/// Atomically save a layer's JSON content with a SHA-256 precondition.
/// Returns the fresh LayerFileDto reflecting the new on-disk state. A
/// HashMismatch is reported to the frontend as a distinguishable error
/// string beginning with "conflict:" so the UI can branch into a diff
/// modal; all other errors return their Display form.
#[tauri::command]
pub fn save_layer(
    state: State<'_, AppState>,
    workspace_id: String,
    layer: LayerKind,
    new_value: Value,
    expected_hash: Option<String>,
) -> Result<LayerFileDto, String> {
    let workspace_path = {
        let cfg = state.config.lock().expect("config mutex poisoned");
        cfg.workspace(&workspace_id)
            .ok_or_else(|| format!("unknown workspace id: {workspace_id}"))?
            .path
            .clone()
    };
    let path = resolve_layer_path(&workspace_path, layer)?;

    let expected = match expected_hash.as_deref() {
        None => None,
        Some(hex) => Some(
            from_hex(hex)
                .ok_or_else(|| format!("invalid expected_hash (not 64 hex chars): {hex}"))?,
        ),
    };

    let mut bytes =
        serde_json::to_vec_pretty(&new_value).map_err(|e| format!("serialize new_value: {e}"))?;
    bytes.push(b'\n');

    match writers::atomic_write_if(&path, &bytes, expected) {
        Ok(_) => {
            let reloaded = layers::load_layer(layer, path).map_err(|e| e.to_string())?;
            Ok(LayerFileDto::from_layer(&reloaded))
        }
        Err(writers::WriterError::HashMismatch { .. }) => Err(format!(
            "conflict: {path} changed since edit started",
            path = path.display()
        )),
        Err(e) => Err(e.to_string()),
    }
}

#[derive(Debug, Clone, Serialize)]
pub struct PluginsStateDto {
    pub installed: Vec<InstalledPlugin>,
    /// Per-tier enablement: layer kind (kebab-case) → `{ "name@marketplace": bool }`.
    pub per_tier: BTreeMap<String, BTreeMap<String, bool>>,
}

/// Read the installed-plugins registry and the per-tier `enabledPlugins` map
/// for a workspace. Frontend joins them into a toggle list.
#[tauri::command]
pub fn get_plugins_state(
    state: State<'_, AppState>,
    workspace_id: String,
) -> Result<PluginsStateDto, String> {
    let workspace_path = {
        let cfg = state.config.lock().expect("config mutex poisoned");
        cfg.workspace(&workspace_id)
            .ok_or_else(|| format!("unknown workspace id: {workspace_id}"))?
            .path
            .clone()
    };
    let ws = WorkspacePaths::new(workspace_path.clone()).map_err(|e| e.to_string())?;
    let installed =
        plugins::load_installed_plugins(&ws.user.installed_plugins).map_err(|e| e.to_string())?;

    let workspace_layers = load_workspace_layers(&workspace_path).map_err(|e| e.to_string())?;
    let mut per_tier: BTreeMap<String, BTreeMap<String, bool>> = BTreeMap::new();
    for layer in &workspace_layers {
        if let LayerContent::Parsed(v) = &layer.content {
            if let Some(obj) = v.get("enabledPlugins").and_then(|x| x.as_object()) {
                let entries: BTreeMap<String, bool> = obj
                    .iter()
                    .filter_map(|(k, v)| v.as_bool().map(|b| (k.clone(), b)))
                    .collect();
                if !entries.is_empty() {
                    per_tier.insert(layer.kind.as_str().to_string(), entries);
                }
            }
        }
    }

    Ok(PluginsStateDto {
        installed,
        per_tier,
    })
}

#[derive(Debug, Clone, Serialize)]
pub struct McpTierToggles {
    pub enabled: Vec<String>,
    pub disabled: Vec<String>,
}

#[derive(Debug, Clone, Serialize)]
pub struct McpStateDto {
    /// `mcpServers` object from `~/.claude.json`. Read-only for v1.
    pub user_servers: serde_json::Map<String, Value>,
    /// Path to `~/.claude.json` (for display).
    pub user_servers_path: String,
    /// `mcpServers` object from `<project>/.mcp.json`.
    pub project_servers: serde_json::Map<String, Value>,
    /// Path to `<project>/.mcp.json` (for display; may not exist).
    pub project_servers_path: String,
    /// Per-settings-tier activation: layer kind (kebab-case) →
    /// `{ enabled: [names...], disabled: [names...] }` when the tier sets
    /// either array. Tiers that don't touch MCP activation are omitted.
    pub per_tier: BTreeMap<String, McpTierToggles>,
}

/// Aggregate the MCP picture for a workspace: user-scope server defs,
/// project-scope server defs, and per-tier activation lists.
#[tauri::command]
pub fn get_mcp_state(
    state: State<'_, AppState>,
    workspace_id: String,
) -> Result<McpStateDto, String> {
    let workspace_path = {
        let cfg = state.config.lock().expect("config mutex poisoned");
        cfg.workspace(&workspace_id)
            .ok_or_else(|| format!("unknown workspace id: {workspace_id}"))?
            .path
            .clone()
    };
    let ws = WorkspacePaths::new(workspace_path.clone()).map_err(|e| e.to_string())?;

    let user_servers = mcp::load_mcp_servers(&ws.user.claude_json).map_err(|e| e.to_string())?;
    let project_servers = mcp::load_mcp_servers(&ws.project.mcp).map_err(|e| e.to_string())?;

    let workspace_layers = load_workspace_layers(&workspace_path).map_err(|e| e.to_string())?;
    let mut per_tier: BTreeMap<String, McpTierToggles> = BTreeMap::new();
    for layer in &workspace_layers {
        if let LayerContent::Parsed(v) = &layer.content {
            let enabled = extract_string_array(v, "enabledMcpjsonServers");
            let disabled = extract_string_array(v, "disabledMcpjsonServers");
            if !enabled.is_empty() || !disabled.is_empty() {
                per_tier.insert(
                    layer.kind.as_str().to_string(),
                    McpTierToggles { enabled, disabled },
                );
            }
        }
    }

    Ok(McpStateDto {
        user_servers,
        user_servers_path: paths::display_path(&ws.user.claude_json),
        project_servers,
        project_servers_path: paths::display_path(&ws.project.mcp),
        per_tier,
    })
}

fn extract_string_array(root: &Value, key: &str) -> Vec<String> {
    root.get(key)
        .and_then(|v| v.as_array())
        .map(|arr| {
            arr.iter()
                .filter_map(|x| x.as_str().map(String::from))
                .collect()
        })
        .unwrap_or_default()
}

#[derive(Debug, Clone, Copy, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum MemoryScope {
    User,
    Project,
}

#[derive(Debug, Clone, Copy, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum MemoryFile {
    Claude,
    Agents,
    Gemini,
}

#[derive(Debug, Clone, Serialize)]
pub struct MemoryFileDto {
    pub path: String,
    pub exists: bool,
    /// UTF-8 file content. None when the file does not exist.
    pub content: Option<String>,
    /// Hex SHA-256 of the on-disk bytes. None when absent.
    pub hash: Option<String>,
}

/// Read a CLAUDE.md/AGENTS.md/GEMINI.md at the given scope.
#[tauri::command]
pub fn read_memory_file(
    state: State<'_, AppState>,
    workspace_id: String,
    scope: MemoryScope,
    file: MemoryFile,
) -> Result<MemoryFileDto, String> {
    let workspace_path = {
        let cfg = state.config.lock().expect("config mutex poisoned");
        cfg.workspace(&workspace_id)
            .ok_or_else(|| format!("unknown workspace id: {workspace_id}"))?
            .path
            .clone()
    };
    let path = resolve_memory_path(&workspace_path, scope, file)?;
    match std::fs::read(&path) {
        Ok(bytes) => {
            let hash = Some(to_hex(&layers::sha256(&bytes)));
            let content = match String::from_utf8(bytes) {
                Ok(s) => Some(s),
                Err(_) => {
                    return Err(format!("{} is not valid UTF-8", paths::display_path(&path)));
                }
            };
            Ok(MemoryFileDto {
                path: paths::display_path(&path),
                exists: true,
                content,
                hash,
            })
        }
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(MemoryFileDto {
            path: paths::display_path(&path),
            exists: false,
            content: None,
            hash: None,
        }),
        Err(e) => Err(format!("I/O reading {}: {e}", paths::display_path(&path))),
    }
}

/// Atomically save a memory file with a SHA-256 precondition.
/// HashMismatch surfaces as a "conflict:" error, same as save_layer.
#[tauri::command]
pub fn save_memory_file(
    state: State<'_, AppState>,
    workspace_id: String,
    scope: MemoryScope,
    file: MemoryFile,
    new_text: String,
    expected_hash: Option<String>,
) -> Result<MemoryFileDto, String> {
    let workspace_path = {
        let cfg = state.config.lock().expect("config mutex poisoned");
        cfg.workspace(&workspace_id)
            .ok_or_else(|| format!("unknown workspace id: {workspace_id}"))?
            .path
            .clone()
    };
    let path = resolve_memory_path(&workspace_path, scope, file)?;

    let expected = match expected_hash.as_deref() {
        None => None,
        Some(hex) => Some(
            from_hex(hex)
                .ok_or_else(|| format!("invalid expected_hash (not 64 hex chars): {hex}"))?,
        ),
    };

    match writers::atomic_write_if(&path, new_text.as_bytes(), expected) {
        Ok(hash) => Ok(MemoryFileDto {
            path: paths::display_path(&path),
            exists: true,
            content: Some(new_text),
            hash: Some(to_hex(&hash)),
        }),
        Err(writers::WriterError::HashMismatch { .. }) => Err(format!(
            "conflict: {path} changed since edit started",
            path = path.display()
        )),
        Err(e) => Err(e.to_string()),
    }
}

#[derive(Debug, Clone, Serialize)]
pub struct RestoreResult {
    /// The source file path the backup was written back to.
    pub path: String,
    /// Hex SHA-256 of the newly-restored content.
    pub new_hash: String,
    /// Size of the restored content in bytes.
    pub size_bytes: u64,
}

/// List backups captured for a specific settings tier in this workspace.
/// Newest first. Empty list when no backups exist.
#[tauri::command]
pub fn list_backups_for_layer(
    state: State<'_, AppState>,
    workspace_id: String,
    layer: LayerKind,
) -> Result<Vec<BackupEntry>, String> {
    let workspace_path = workspace_path_for(&state, &workspace_id)?;
    let path = resolve_layer_path(&workspace_path, layer)?;
    backup::list_for_source(&path).map_err(|e| e.to_string())
}

/// List backups captured for a memory file (CLAUDE.md / AGENTS.md / GEMINI.md).
#[tauri::command]
pub fn list_backups_for_memory(
    state: State<'_, AppState>,
    workspace_id: String,
    scope: MemoryScope,
    file: MemoryFile,
) -> Result<Vec<BackupEntry>, String> {
    let workspace_path = workspace_path_for(&state, &workspace_id)?;
    let path = resolve_memory_path(&workspace_path, scope, file)?;
    backup::list_for_source(&path).map_err(|e| e.to_string())
}

/// Restore a previously backed-up file. The target path is read from the
/// backup directory's `source.txt`, so the caller only needs the backup id.
/// `expected_hash` — if provided — guards against overwriting a file that has
/// been modified externally since the UI loaded it; mismatch surfaces as a
/// "conflict:" error. Pass `None` to force-overwrite (e.g., first-time restore
/// into a file that was deleted out from under us).
#[tauri::command]
pub fn restore_backup(
    backup_id: String,
    expected_hash: Option<String>,
) -> Result<RestoreResult, String> {
    let backup_file = backup::resolve_entry_path(&backup_id).map_err(|e| e.to_string())?;
    let source_txt = backup_file
        .parent()
        .ok_or_else(|| format!("backup file has no parent: {}", backup_file.display()))?
        .join("source.txt");
    let target: PathBuf = std::fs::read_to_string(&source_txt)
        .map_err(|e| format!("read {}: {e}", source_txt.display()))?
        .trim()
        .into();
    if target.as_os_str().is_empty() {
        return Err(format!("empty source path in {}", source_txt.display()));
    }

    let bytes =
        std::fs::read(&backup_file).map_err(|e| format!("read {}: {e}", backup_file.display()))?;

    let expected = match expected_hash.as_deref() {
        None => None,
        Some(hex) => Some(from_hex(hex).ok_or_else(|| format!("invalid expected_hash: {hex}"))?),
    };

    match writers::atomic_write_if(&target, &bytes, expected) {
        Ok(new_hash) => Ok(RestoreResult {
            path: paths::display_path(&target),
            new_hash: to_hex(&new_hash),
            size_bytes: bytes.len() as u64,
        }),
        Err(writers::WriterError::HashMismatch { .. }) => Err(format!(
            "conflict: {} changed since snapshot",
            target.display()
        )),
        Err(e) => Err(e.to_string()),
    }
}

fn workspace_path_for(state: &State<'_, AppState>, workspace_id: &str) -> Result<PathBuf, String> {
    let cfg = state.config.lock().expect("config mutex poisoned");
    Ok(cfg
        .workspace(workspace_id)
        .ok_or_else(|| format!("unknown workspace id: {workspace_id}"))?
        .path
        .clone())
}

fn resolve_memory_path(
    project_root: &Path,
    scope: MemoryScope,
    file: MemoryFile,
) -> Result<PathBuf, String> {
    let ws = WorkspacePaths::new(project_root.to_path_buf()).map_err(|e| e.to_string())?;
    let memory = match scope {
        MemoryScope::User => ws.user.memory,
        MemoryScope::Project => ws.project.memory,
    };
    Ok(match file {
        MemoryFile::Claude => memory.claude,
        MemoryFile::Agents => memory.agents,
        MemoryFile::Gemini => memory.gemini,
    })
}

/// Resolve the absolute path of the given settings tier for a workspace.
/// Managed tier returns the platform default or an error on unsupported OS.
fn resolve_layer_path(project_root: &Path, layer: LayerKind) -> Result<PathBuf, String> {
    let ws = WorkspacePaths::new(project_root.to_path_buf()).map_err(|e| e.to_string())?;
    Ok(match layer {
        LayerKind::Managed => paths::managed_settings_default_path()
            .ok_or_else(|| "managed-settings path is not defined on this platform".to_string())?,
        LayerKind::User => ws.user.settings,
        LayerKind::UserLocal => ws.user.settings_local,
        LayerKind::Project => ws.project.settings,
        LayerKind::ProjectLocal => ws.project.settings_local,
    })
}

fn to_hex(bytes: &[u8]) -> String {
    use std::fmt::Write as _;
    let mut s = String::with_capacity(bytes.len() * 2);
    for b in bytes {
        let _ = write!(&mut s, "{b:02x}");
    }
    s
}

fn from_hex(s: &str) -> Option<[u8; 32]> {
    if s.len() != 64 {
        return None;
    }
    let mut out = [0u8; 32];
    for (i, chunk) in s.as_bytes().chunks_exact(2).enumerate() {
        let hi = hex_digit(chunk[0])?;
        let lo = hex_digit(chunk[1])?;
        out[i] = (hi << 4) | lo;
    }
    Some(out)
}

fn hex_digit(c: u8) -> Option<u8> {
    match c {
        b'0'..=b'9' => Some(c - b'0'),
        b'a'..=b'f' => Some(c - b'a' + 10),
        b'A'..=b'F' => Some(c - b'A' + 10),
        _ => None,
    }
}

/// Load the settings.json tier files for a workspace. On platforms where no
/// managed-settings path is defined, the managed tier is omitted entirely
/// (not synthesized as Absent) so `origins` stays clean.
fn load_workspace_layers(project_root: &std::path::Path) -> Result<Vec<Layer>, String> {
    let ws = WorkspacePaths::new(project_root.to_path_buf()).map_err(|e| e.to_string())?;

    let mut tiers: Vec<(LayerKind, PathBuf)> = Vec::with_capacity(5);
    if let Some(managed) = paths::managed_settings_default_path() {
        tiers.push((LayerKind::Managed, managed));
    }
    tiers.push((LayerKind::User, ws.user.settings.clone()));
    tiers.push((LayerKind::UserLocal, ws.user.settings_local.clone()));
    tiers.push((LayerKind::Project, ws.project.settings.clone()));
    tiers.push((LayerKind::ProjectLocal, ws.project.settings_local.clone()));

    tiers
        .into_iter()
        .map(|(kind, path)| layers::load_layer(kind, path).map_err(|e| e.to_string()))
        .collect()
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
    fn hex_roundtrips_32_bytes() {
        let original: [u8; 32] = std::array::from_fn(|i| (i * 7) as u8);
        let hex = to_hex(&original);
        assert_eq!(hex.len(), 64);
        let back = from_hex(&hex).unwrap();
        assert_eq!(back, original);
    }

    #[test]
    fn from_hex_rejects_wrong_length_and_bad_chars() {
        assert!(from_hex("").is_none());
        assert!(from_hex("abcd").is_none());
        assert!(from_hex(&"0".repeat(63)).is_none());
        assert!(from_hex(&format!("{}{}", "g".repeat(2), "0".repeat(62))).is_none());
        // Exact 64 hex chars works.
        assert!(from_hex(&"0".repeat(64)).is_some());
    }

    #[test]
    fn from_hex_accepts_upper_and_lower_case() {
        let lower = "deadbeef".repeat(8);
        let upper = "DEADBEEF".repeat(8);
        assert_eq!(from_hex(&lower).unwrap(), from_hex(&upper).unwrap());
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
