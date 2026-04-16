//! Atomic file writes with optional SHA-256 precondition.
//!
//! An edit session records the target file's hash at the start; on commit,
//! the current on-disk hash is compared and the write is refused if the
//! file has changed out from under us. The write itself is atomic: bytes
//! land in a same-directory tempfile, are `fsync`ed, then renamed over
//! the target. `tempfile::persist` handles the Windows rename semantics.

use crate::layers::sha256;
use std::fs;
use std::io::Write;
use std::path::{Path, PathBuf};

#[derive(Debug, thiserror::Error)]
pub enum WriterError {
    #[error("I/O error at {path}: {source}")]
    Io {
        path: PathBuf,
        #[source]
        source: std::io::Error,
    },
    #[error("precondition failed: {path} hash is {actual} but expected {expected}")]
    HashMismatch {
        path: PathBuf,
        expected: String,
        actual: String,
    },
}

/// Write `bytes` to `path` atomically. Returns the new SHA-256 hash on success.
///
/// If `expected_hash` is `Some`, the current on-disk content's hash must match
/// or the write is refused with [`WriterError::HashMismatch`]. Missing file
/// under `Some(expected)` is treated as a mismatch (another process likely
/// deleted it).
///
/// If `expected_hash` is `None`, the write is unconditional — used for the
/// very first creation of a file that didn't exist.
///
/// The parent directory is created if missing so, e.g., creating a project's
/// first `.claude/settings.local.json` works without a separate `mkdir` step.
pub fn atomic_write_if(
    path: &Path,
    bytes: &[u8],
    expected_hash: Option<[u8; 32]>,
) -> Result<[u8; 32], WriterError> {
    if let Some(expected) = expected_hash {
        match fs::read(path) {
            Ok(current) => {
                let actual = sha256(&current);
                if actual != expected {
                    return Err(WriterError::HashMismatch {
                        path: path.to_path_buf(),
                        expected: to_hex(&expected),
                        actual: to_hex(&actual),
                    });
                }
            }
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => {
                return Err(WriterError::HashMismatch {
                    path: path.to_path_buf(),
                    expected: to_hex(&expected),
                    actual: "<file missing>".into(),
                });
            }
            Err(source) => {
                return Err(WriterError::Io {
                    path: path.to_path_buf(),
                    source,
                });
            }
        }
    }

    let parent = path.parent().unwrap_or_else(|| Path::new("."));
    if !parent.as_os_str().is_empty() {
        fs::create_dir_all(parent).map_err(|source| WriterError::Io {
            path: parent.to_path_buf(),
            source,
        })?;
    }

    let mut tmp = tempfile::NamedTempFile::new_in(parent).map_err(|source| WriterError::Io {
        path: parent.to_path_buf(),
        source,
    })?;
    tmp.write_all(bytes).map_err(|source| WriterError::Io {
        path: tmp.path().to_path_buf(),
        source,
    })?;
    tmp.as_file().sync_all().map_err(|source| WriterError::Io {
        path: tmp.path().to_path_buf(),
        source,
    })?;
    tmp.persist(path).map_err(|e| WriterError::Io {
        path: path.to_path_buf(),
        source: e.error,
    })?;

    Ok(sha256(bytes))
}

fn to_hex(bytes: &[u8]) -> String {
    use std::fmt::Write as _;
    let mut s = String::with_capacity(bytes.len() * 2);
    for b in bytes {
        let _ = write!(&mut s, "{b:02x}");
    }
    s
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    #[test]
    fn write_to_fresh_file_without_expected_hash() {
        let dir = tempdir().unwrap();
        let path = dir.path().join("settings.json");
        let hash = atomic_write_if(&path, b"{\"a\":1}", None).unwrap();
        assert_eq!(fs::read(&path).unwrap(), b"{\"a\":1}");
        assert_eq!(hash, sha256(b"{\"a\":1}"));
    }

    #[test]
    fn creates_missing_parent_directory() {
        let dir = tempdir().unwrap();
        let path = dir.path().join(".claude").join("settings.local.json");
        assert!(!path.parent().unwrap().exists());
        atomic_write_if(&path, b"{}", None).unwrap();
        assert!(path.exists());
    }

    #[test]
    fn overwrite_with_matching_hash_succeeds() {
        let dir = tempdir().unwrap();
        let path = dir.path().join("settings.json");
        let first = atomic_write_if(&path, b"{\"v\":1}", None).unwrap();
        let second = atomic_write_if(&path, b"{\"v\":2}", Some(first)).unwrap();
        assert_eq!(fs::read(&path).unwrap(), b"{\"v\":2}");
        assert_eq!(second, sha256(b"{\"v\":2}"));
    }

    #[test]
    fn overwrite_with_stale_hash_fails() {
        let dir = tempdir().unwrap();
        let path = dir.path().join("settings.json");
        atomic_write_if(&path, b"{\"v\":1}", None).unwrap();
        // External modification between snapshot and commit
        fs::write(&path, b"{\"v\":999}").unwrap();
        // Caller still believed it was v:1
        let stale = sha256(b"{\"v\":1}");
        let err = atomic_write_if(&path, b"{\"v\":2}", Some(stale)).unwrap_err();
        match err {
            WriterError::HashMismatch { path: p, .. } => assert_eq!(p, path),
            other => panic!("expected HashMismatch, got {other:?}"),
        }
        // File preserves the external change
        assert_eq!(fs::read(&path).unwrap(), b"{\"v\":999}");
    }

    #[test]
    fn expected_hash_on_missing_file_is_mismatch() {
        let dir = tempdir().unwrap();
        let path = dir.path().join("nope.json");
        let fake_hash = sha256(b"whatever");
        let err = atomic_write_if(&path, b"{}", Some(fake_hash)).unwrap_err();
        assert!(
            matches!(err, WriterError::HashMismatch { .. }),
            "got {err:?}"
        );
    }

    #[test]
    fn write_is_atomic_no_temp_files_remain_on_success() {
        let dir = tempdir().unwrap();
        let path = dir.path().join("settings.json");
        atomic_write_if(&path, b"{}", None).unwrap();
        let leftover: Vec<_> = fs::read_dir(dir.path())
            .unwrap()
            .filter_map(|e| e.ok())
            .filter(|e| {
                let n = e.file_name();
                let s = n.to_string_lossy();
                s.contains("tmp") && s != "settings.json"
            })
            .collect();
        assert!(leftover.is_empty(), "leftover tmp files: {leftover:?}");
    }

    #[test]
    fn returned_hash_matches_stored_content() {
        let dir = tempdir().unwrap();
        let path = dir.path().join("x.json");
        let content = br#"{"nested":{"a":[1,2,3]}}"#;
        let hash = atomic_write_if(&path, content, None).unwrap();
        let on_disk = fs::read(&path).unwrap();
        assert_eq!(hash, sha256(&on_disk));
    }
}
