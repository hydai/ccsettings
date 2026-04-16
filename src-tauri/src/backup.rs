//! Pre-write backups.
//!
//! Before every `writers::atomic_write_if` replaces a file, the current
//! on-disk content is copied into an app-managed backup directory. This
//! gives "undo" for free (just restore the most recent backup) without
//! needing a separate journal.
//!
//! Layout: `<data_dir>/ccsettings/backups/<path-hash>/`
//! - `source.txt`        — literal source path (one line, UTF-8)
//! - `<iso-timestamp>.bak` — raw bytes of the prior file, one per snapshot
//!
//! Retention: each directory keeps at most 50 files OR everything ≤ 7 days
//! old, whichever is more inclusive. Pruning runs after every write.

use crate::layers::sha256;
use crate::paths;
use serde::Serialize;
use std::fs;
use std::path::{Path, PathBuf};
use std::time::{Duration, SystemTime, UNIX_EPOCH};
use time::format_description::well_known::Rfc3339;
use time::OffsetDateTime;

const BACKUPS_SUBDIR: &str = "backups";
const RETENTION_MAX_FILES: usize = 50;
const RETENTION_MAX_AGE: Duration = Duration::from_secs(7 * 24 * 60 * 60);

#[derive(Debug, thiserror::Error)]
pub enum BackupError {
    #[error("path resolution: {0}")]
    Paths(#[from] paths::PathsError),
    #[error("I/O at {path}: {source}")]
    Io {
        path: PathBuf,
        #[source]
        source: std::io::Error,
    },
}

#[derive(Debug, Clone, Serialize)]
pub struct BackupEntry {
    /// Opaque id of the form `<path-hash>/<timestamp>`; round-trips to a path.
    pub id: String,
    /// Original file this backup captures (display form, forward slashes).
    pub source_path: String,
    /// Absolute path to the backup file itself.
    pub backup_path: String,
    /// When the backup was written, as Unix epoch milliseconds.
    pub created_unix_millis: i64,
    pub size_bytes: u64,
    /// Hex SHA-256 of the backed-up content.
    pub content_hash: String,
}

/// Copy the current content of `source` into the backup directory and prune.
/// Missing source → `Ok(None)` (no backup to take). Everything else is best
/// effort; hard I/O errors surface so the writer can decide whether to abort.
pub fn backup_before_write(source: &Path) -> Result<Option<BackupEntry>, BackupError> {
    let bytes = match fs::read(source) {
        Ok(b) => b,
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Ok(None),
        Err(source_err) => {
            return Err(BackupError::Io {
                path: source.to_path_buf(),
                source: source_err,
            });
        }
    };

    let path_hash = source_path_hash(source);
    let dir = backups_root()?.join(&path_hash);
    fs::create_dir_all(&dir).map_err(|e| BackupError::Io {
        path: dir.clone(),
        source: e,
    })?;

    // Record source path once for later reverse lookup.
    let source_txt = dir.join("source.txt");
    if !source_txt.exists() {
        fs::write(&source_txt, source.to_string_lossy().as_bytes()).map_err(|e| {
            BackupError::Io {
                path: source_txt.clone(),
                source: e,
            }
        })?;
    }

    let now = SystemTime::now();
    let timestamp = format_timestamp(now);
    let backup_path = dir.join(format!("{timestamp}.bak"));
    fs::write(&backup_path, &bytes).map_err(|e| BackupError::Io {
        path: backup_path.clone(),
        source: e,
    })?;

    // Prune after adding (keeping the just-added entry).
    let _ = prune_dir(&dir);

    Ok(Some(BackupEntry {
        id: format!("{path_hash}/{timestamp}"),
        source_path: paths::display_path(source),
        backup_path: paths::display_path(&backup_path),
        created_unix_millis: unix_millis(now),
        size_bytes: bytes.len() as u64,
        content_hash: to_hex(&sha256(&bytes)),
    }))
}

/// List backups captured for a specific source file, newest first.
pub fn list_for_source(source: &Path) -> Result<Vec<BackupEntry>, BackupError> {
    let dir = backups_root()?.join(source_path_hash(source));
    if !dir.exists() {
        return Ok(Vec::new());
    }
    let mut entries = read_bak_entries(&dir, source)?;
    entries.sort_by(|a, b| b.created_unix_millis.cmp(&a.created_unix_millis));
    Ok(entries)
}

/// Return the absolute backup file path for a given entry id, if it exists.
/// Safe against `..` traversal — the id must be a two-segment `<hash>/<ts>`.
pub fn resolve_entry_path(id: &str) -> Result<PathBuf, BackupError> {
    let (hash, ts) = id.split_once('/').ok_or_else(|| BackupError::Io {
        path: PathBuf::from(id),
        source: std::io::Error::new(std::io::ErrorKind::InvalidInput, "bad backup id"),
    })?;
    if hash.contains('/') || hash.contains("..") || ts.contains('/') || ts.contains("..") {
        return Err(BackupError::Io {
            path: PathBuf::from(id),
            source: std::io::Error::new(
                std::io::ErrorKind::InvalidInput,
                "id segments must not contain slashes or ..",
            ),
        });
    }
    Ok(backups_root()?.join(hash).join(format!("{ts}.bak")))
}

fn backups_root() -> Result<PathBuf, BackupError> {
    Ok(paths::app_data_dir()?.join(BACKUPS_SUBDIR))
}

fn source_path_hash(p: &Path) -> String {
    let h = sha256(p.to_string_lossy().as_bytes());
    // 16 hex chars = 8 bytes = 2^64 space; plenty for dedup.
    to_hex(&h[..8])
}

fn format_timestamp(t: SystemTime) -> String {
    let odt = OffsetDateTime::from(t);
    odt.format(&Rfc3339)
        .map(|s| s.replace(':', "-"))
        .unwrap_or_else(|_| "unknown-time".into())
}

fn unix_millis(t: SystemTime) -> i64 {
    t.duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

fn to_hex(bytes: &[u8]) -> String {
    use std::fmt::Write as _;
    let mut s = String::with_capacity(bytes.len() * 2);
    for b in bytes {
        let _ = write!(&mut s, "{b:02x}");
    }
    s
}

fn read_bak_entries(dir: &Path, source: &Path) -> Result<Vec<BackupEntry>, BackupError> {
    let hash = dir
        .file_name()
        .map(|n| n.to_string_lossy().into_owned())
        .unwrap_or_default();
    let mut out = Vec::new();
    for entry in fs::read_dir(dir)
        .map_err(|e| BackupError::Io {
            path: dir.to_path_buf(),
            source: e,
        })?
        .flatten()
    {
        let path = entry.path();
        if path.extension().and_then(|s| s.to_str()) != Some("bak") {
            continue;
        }
        let Ok(meta) = entry.metadata() else { continue };
        let Ok(created) = meta.modified() else {
            continue;
        };
        let ts = path
            .file_stem()
            .map(|n| n.to_string_lossy().into_owned())
            .unwrap_or_default();
        let bytes = fs::read(&path).unwrap_or_default();
        out.push(BackupEntry {
            id: format!("{hash}/{ts}"),
            source_path: paths::display_path(source),
            backup_path: paths::display_path(&path),
            created_unix_millis: unix_millis(created),
            size_bytes: meta.len(),
            content_hash: to_hex(&sha256(&bytes)),
        });
    }
    Ok(out)
}

fn prune_dir(dir: &Path) -> Result<usize, BackupError> {
    let now = SystemTime::now();
    let cutoff = now.checked_sub(RETENTION_MAX_AGE).unwrap_or(UNIX_EPOCH);

    let mut entries: Vec<(SystemTime, PathBuf)> = Vec::new();
    for entry in fs::read_dir(dir)
        .map_err(|e| BackupError::Io {
            path: dir.to_path_buf(),
            source: e,
        })?
        .flatten()
    {
        let path = entry.path();
        if path.extension().and_then(|s| s.to_str()) != Some("bak") {
            continue;
        }
        if let Ok(meta) = entry.metadata() {
            if let Ok(mtime) = meta.modified() {
                entries.push((mtime, path));
            }
        }
    }
    entries.sort_by(|a, b| b.0.cmp(&a.0));

    let mut removed = 0usize;
    for (i, (mtime, path)) in entries.iter().enumerate() {
        let keep = i < RETENTION_MAX_FILES || *mtime >= cutoff;
        if !keep && fs::remove_file(path).is_ok() {
            removed += 1;
        }
    }
    Ok(removed)
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    #[test]
    fn path_hash_is_stable_and_short() {
        let a = source_path_hash(Path::new("/a/b/c"));
        let b = source_path_hash(Path::new("/a/b/c"));
        assert_eq!(a, b);
        assert_eq!(a.len(), 16);
        assert_ne!(a, source_path_hash(Path::new("/a/b/d")));
    }

    #[test]
    fn format_timestamp_is_filesystem_safe() {
        let s = format_timestamp(SystemTime::UNIX_EPOCH);
        assert!(!s.contains(':'), "got {s}");
        assert!(s.contains('T'));
    }

    #[test]
    fn resolve_entry_rejects_path_traversal() {
        assert!(resolve_entry_path("../etc/passwd").is_err());
        assert!(resolve_entry_path("aaaa/../../etc").is_err());
        assert!(resolve_entry_path("single-segment").is_err());
    }

    #[test]
    fn prune_removes_oldest_beyond_retention() {
        // Synthetic directory with 60 old .bak files — prune should cull
        // anything past the 50-file window that's also older than 7 days.
        let dir = tempdir().unwrap();
        let old = SystemTime::UNIX_EPOCH + Duration::from_secs(1); // very old
        for i in 0..60 {
            let path = dir.path().join(format!("2000-01-01T00-00-{i:02}Z.bak"));
            fs::write(&path, b"x").unwrap();
            // Force mtime to old so they're eligible for age-based pruning.
            let times = std::fs::FileTimes::new().set_modified(old);
            if let Ok(f) = std::fs::File::options().write(true).open(&path) {
                let _ = f.set_times(times);
            }
        }
        let removed = prune_dir(dir.path()).unwrap();
        assert_eq!(
            removed, 10,
            "should remove the 10 oldest files over the cap"
        );
        let remaining = fs::read_dir(dir.path())
            .unwrap()
            .filter_map(|e| e.ok())
            .filter(|e| e.path().extension().and_then(|s| s.to_str()) == Some("bak"))
            .count();
        assert_eq!(remaining, 50);
    }
}
