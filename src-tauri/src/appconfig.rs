//! Persistent state owned by the app itself — the workspace list, theme
//! preference, etc. Stored as JSON at `dirs::config_dir()/ccsettings/config.json`.
//!
//! This is ccsettings' own config, NOT Claude Code's. Those are separate
//! concerns loaded via `crate::layers`.

use crate::paths;
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};
use time::serde::rfc3339;
use time::OffsetDateTime;
use uuid::Uuid;

#[derive(Debug, thiserror::Error)]
pub enum AppConfigError {
    #[error("path resolution failed: {0}")]
    Paths(#[from] paths::PathsError),
    #[error("I/O error at {path}: {source}")]
    Io {
        path: PathBuf,
        #[source]
        source: std::io::Error,
    },
    #[error("JSON error in {path}: {source}")]
    Json {
        path: PathBuf,
        #[source]
        source: serde_json::Error,
    },
}

/// Schema version for forward compatibility. Bumped when the shape changes.
pub const SCHEMA_VERSION: u32 = 1;

#[derive(Debug, Default, Clone, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Theme {
    #[default]
    System,
    Light,
    Dark,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Workspace {
    pub id: String,
    pub name: String,
    pub path: PathBuf,
    #[serde(with = "rfc3339")]
    pub added_at: OffsetDateTime,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppConfig {
    pub version: u32,
    pub workspaces: Vec<Workspace>,
    pub theme: Theme,
}

impl Default for AppConfig {
    fn default() -> Self {
        Self {
            version: SCHEMA_VERSION,
            workspaces: Vec::new(),
            theme: Theme::default(),
        }
    }
}

impl AppConfig {
    /// Add a new workspace and return a reference to it. If `name` is None,
    /// the last path component is used. Does NOT deduplicate by path —
    /// callers may want multiple workspaces pointing at the same directory
    /// with different names.
    pub fn add_workspace(&mut self, path: PathBuf, name: Option<String>) -> &Workspace {
        let name = name.unwrap_or_else(|| {
            path.file_name()
                .map(|n| n.to_string_lossy().into_owned())
                .unwrap_or_else(|| "workspace".to_string())
        });
        let ws = Workspace {
            id: Uuid::new_v4().to_string(),
            name,
            path,
            added_at: OffsetDateTime::now_utc(),
        };
        self.workspaces.push(ws);
        self.workspaces.last().expect("just pushed")
    }

    /// Remove by id; returns true if a workspace was removed.
    pub fn remove_workspace(&mut self, id: &str) -> bool {
        let before = self.workspaces.len();
        self.workspaces.retain(|w| w.id != id);
        self.workspaces.len() < before
    }

    /// Rename by id; returns true if a workspace matched.
    pub fn rename_workspace(&mut self, id: &str, new_name: String) -> bool {
        for w in self.workspaces.iter_mut() {
            if w.id == id {
                w.name = new_name;
                return true;
            }
        }
        false
    }

    /// Look up a workspace by id.
    pub fn workspace(&self, id: &str) -> Option<&Workspace> {
        self.workspaces.iter().find(|w| w.id == id)
    }
}

/// Default config file path: `<OS config dir>/ccsettings/config.json`.
pub fn default_config_path() -> Result<PathBuf, AppConfigError> {
    Ok(paths::app_config_dir()?.join("config.json"))
}

/// Load from the default path. Missing file → returns [`AppConfig::default`].
pub fn load() -> Result<AppConfig, AppConfigError> {
    load_from(&default_config_path()?)
}

/// Load from an explicit path. Missing file → default config (not an error).
pub fn load_from(path: &Path) -> Result<AppConfig, AppConfigError> {
    match fs::read(path) {
        Ok(bytes) => serde_json::from_slice(&bytes).map_err(|source| AppConfigError::Json {
            path: path.to_path_buf(),
            source,
        }),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(AppConfig::default()),
        Err(source) => Err(AppConfigError::Io {
            path: path.to_path_buf(),
            source,
        }),
    }
}

/// Save to the default path, creating the parent directory if missing.
pub fn save(config: &AppConfig) -> Result<(), AppConfigError> {
    save_to(&default_config_path()?, config)
}

/// Save to an explicit path, creating the parent directory if missing.
pub fn save_to(path: &Path, config: &AppConfig) -> Result<(), AppConfigError> {
    if let Some(parent) = path.parent() {
        if !parent.as_os_str().is_empty() {
            fs::create_dir_all(parent).map_err(|source| AppConfigError::Io {
                path: parent.to_path_buf(),
                source,
            })?;
        }
    }
    let bytes = serde_json::to_vec_pretty(config).map_err(|source| AppConfigError::Json {
        path: path.to_path_buf(),
        source,
    })?;
    fs::write(path, bytes).map_err(|source| AppConfigError::Io {
        path: path.to_path_buf(),
        source,
    })?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    #[test]
    fn default_is_empty_with_current_schema() {
        let c = AppConfig::default();
        assert_eq!(c.version, SCHEMA_VERSION);
        assert!(c.workspaces.is_empty());
        assert!(matches!(c.theme, Theme::System));
    }

    #[test]
    fn load_from_missing_file_returns_default() {
        let c = load_from(Path::new("/tmp/ccsettings-no-config-xxxxxxx.json")).unwrap();
        assert_eq!(c.version, SCHEMA_VERSION);
        assert!(c.workspaces.is_empty());
    }

    #[test]
    fn add_remove_rename_workspace_works() {
        let mut c = AppConfig::default();
        let id1 = c
            .add_workspace(PathBuf::from("/a"), Some("Alpha".into()))
            .id
            .clone();
        let id2 = c.add_workspace(PathBuf::from("/b"), None).id.clone();
        assert_eq!(c.workspaces.len(), 2);
        assert_eq!(c.workspace(&id2).unwrap().name, "b");

        assert!(c.rename_workspace(&id2, "Beta".into()));
        assert_eq!(c.workspace(&id2).unwrap().name, "Beta");
        assert!(!c.rename_workspace("not-an-id", "nope".into()));

        assert!(c.remove_workspace(&id1));
        assert_eq!(c.workspaces.len(), 1);
        assert!(!c.remove_workspace(&id1));
    }

    #[test]
    fn auto_name_is_last_path_component() {
        let mut c = AppConfig::default();
        let w = c.add_workspace(PathBuf::from("/foo/bar/baz"), None);
        assert_eq!(w.name, "baz");
    }

    #[test]
    fn round_trips_through_save_and_load() {
        let dir = tempdir().unwrap();
        let path = dir.path().join("sub").join("config.json"); // parent missing

        let mut c = AppConfig::default();
        c.add_workspace(PathBuf::from("/work/one"), Some("One".into()));
        c.add_workspace(PathBuf::from("/work/two"), None);
        c.theme = Theme::Dark;

        save_to(&path, &c).unwrap();
        assert!(path.exists(), "save_to should create parent dirs");

        let reloaded = load_from(&path).unwrap();
        assert_eq!(reloaded.version, c.version);
        assert_eq!(reloaded.workspaces.len(), 2);
        assert_eq!(reloaded.workspaces[0].name, "One");
        assert_eq!(reloaded.workspaces[1].name, "two");
        assert!(matches!(reloaded.theme, Theme::Dark));

        // Timestamps survive round-trip to the second.
        let expected = c.workspaces[0].added_at.unix_timestamp();
        let got = reloaded.workspaces[0].added_at.unix_timestamp();
        assert_eq!(expected, got);
    }

    #[test]
    fn invalid_json_returns_json_error_with_path() {
        let dir = tempdir().unwrap();
        let path = dir.path().join("bad.json");
        fs::write(&path, b"{ not valid").unwrap();

        let err = load_from(&path).unwrap_err();
        match err {
            AppConfigError::Json { path: p, .. } => assert_eq!(p, path),
            other => panic!("expected Json error, got {other:?}"),
        }
    }
}
