//! Read-only plugin registry parser for `~/.claude/plugins/installed_plugins.json`.
//!
//! The registry is Claude Code's source of truth for "which plugins are
//! installed"; enablement (which of the installed ones are active) lives
//! in `settings.json.enabledPlugins`. The app joins the two so users can
//! see all installed plugins and toggle their enabled state per tier.

use serde::Serialize;
use serde_json::Value;
use std::fs;
use std::path::Path;

#[derive(Debug, Clone, Serialize)]
pub struct InstalledPlugin {
    /// `"<name>@<marketplace>"` — the same key used in `enabledPlugins`.
    pub key: String,
    pub name: String,
    pub marketplace: String,
    pub version: Option<String>,
    pub scope: Option<String>,
    pub install_path: Option<String>,
}

#[derive(Debug, thiserror::Error)]
pub enum PluginsError {
    #[error("I/O error at {path}: {source}")]
    Io {
        path: std::path::PathBuf,
        #[source]
        source: std::io::Error,
    },
    #[error("parse error in {path}: {source}")]
    Parse {
        path: std::path::PathBuf,
        #[source]
        source: serde_json::Error,
    },
    #[error("unexpected shape in {path}: {msg}")]
    Shape {
        path: std::path::PathBuf,
        msg: String,
    },
}

/// Load the installed plugins from a given path. Missing file → empty list
/// (the user hasn't installed any plugins yet; not an error).
pub fn load_installed_plugins(path: &Path) -> Result<Vec<InstalledPlugin>, PluginsError> {
    let bytes = match fs::read(path) {
        Ok(b) => b,
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Ok(Vec::new()),
        Err(source) => {
            return Err(PluginsError::Io {
                path: path.to_path_buf(),
                source,
            });
        }
    };
    let raw: Value = serde_json::from_slice(&bytes).map_err(|source| PluginsError::Parse {
        path: path.to_path_buf(),
        source,
    })?;

    let plugins_obj = raw
        .get("plugins")
        .and_then(|v| v.as_object())
        .ok_or_else(|| PluginsError::Shape {
            path: path.to_path_buf(),
            msg: "expected top-level `plugins` object".into(),
        })?;

    let mut out = Vec::with_capacity(plugins_obj.len());
    for (key, value) in plugins_obj {
        // Each key maps to an array of install records (there may be
        // multiple versions; the newest is at index 0).
        let record = value
            .as_array()
            .and_then(|a| a.first())
            .and_then(|v| v.as_object());

        let (name, marketplace) = split_key(key);
        out.push(InstalledPlugin {
            key: key.clone(),
            name,
            marketplace,
            version: record
                .and_then(|r| r.get("version"))
                .and_then(|v| v.as_str())
                .map(String::from),
            scope: record
                .and_then(|r| r.get("scope"))
                .and_then(|v| v.as_str())
                .map(String::from),
            install_path: record
                .and_then(|r| r.get("installPath"))
                .and_then(|v| v.as_str())
                .map(String::from),
        });
    }
    out.sort_by(|a, b| a.name.cmp(&b.name).then(a.marketplace.cmp(&b.marketplace)));
    Ok(out)
}

/// Split a `"name@marketplace"` key. Keys missing the `@` are treated as a
/// name with an empty marketplace (shouldn't occur for valid Claude Code
/// installs but handled defensively).
fn split_key(key: &str) -> (String, String) {
    match key.rsplit_once('@') {
        Some((name, mk)) => (name.to_string(), mk.to_string()),
        None => (key.to_string(), String::new()),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    #[test]
    fn missing_file_returns_empty_list() {
        let got = load_installed_plugins(Path::new("/tmp/ccsettings-no-plugins-xxx.json")).unwrap();
        assert!(got.is_empty());
    }

    #[test]
    fn parses_real_shape_and_sorts() {
        let dir = tempdir().unwrap();
        let path = dir.path().join("installed_plugins.json");
        fs::write(
            &path,
            br#"{
                "version": 2,
                "plugins": {
                    "zeta@marketA": [{"version": "1.0.0", "scope": "user", "installPath": "/p/zeta"}],
                    "alpha@marketB": [{"version": "0.2.0", "scope": "user", "installPath": "/p/alpha"}],
                    "alpha@marketA": [{"version": "0.1.0"}]
                }
            }"#,
        )
        .unwrap();
        let plugins = load_installed_plugins(&path).unwrap();
        assert_eq!(plugins.len(), 3);
        // sort: name asc, then marketplace asc
        assert_eq!(plugins[0].key, "alpha@marketA");
        assert_eq!(plugins[1].key, "alpha@marketB");
        assert_eq!(plugins[2].key, "zeta@marketA");
        assert_eq!(plugins[1].version.as_deref(), Some("0.2.0"));
        assert_eq!(plugins[0].install_path, None);
    }

    #[test]
    fn missing_plugins_object_is_shape_error() {
        let dir = tempdir().unwrap();
        let path = dir.path().join("wrong.json");
        fs::write(&path, br#"{"version":2}"#).unwrap();
        let err = load_installed_plugins(&path).unwrap_err();
        assert!(matches!(err, PluginsError::Shape { .. }));
    }

    #[test]
    fn key_without_at_sign_still_loads() {
        let dir = tempdir().unwrap();
        let path = dir.path().join("odd.json");
        fs::write(
            &path,
            br#"{"version":2, "plugins": {"loose": [{"version":"0"}]}}"#,
        )
        .unwrap();
        let plugins = load_installed_plugins(&path).unwrap();
        assert_eq!(plugins.len(), 1);
        assert_eq!(plugins[0].name, "loose");
        assert_eq!(plugins[0].marketplace, "");
    }
}
