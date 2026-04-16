//! Independent loading of each cascade tier.
//!
//! The cascade engine consumes a slice of [`Layer`] values, one per tier, each
//! carrying the raw JSON, a SHA-256 hash of the file content, and the source
//! path. A missing file is represented as [`LayerContent::Absent`]; a file with
//! invalid JSON is represented as [`LayerContent::ParseError`] so the UI can
//! show the error without silently dropping the layer.

use serde::{Deserialize, Serialize};
use serde_json::Value;
use sha2::{Digest, Sha256};
use std::fs;
use std::path::PathBuf;

/// Precedence tier. Values earlier in the enum have LOWER precedence; later
/// tiers override earlier ones for scalars and deep-merged objects.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum LayerKind {
    Managed,
    User,
    UserLocal,
    Project,
    ProjectLocal,
}

impl LayerKind {
    /// All tiers in precedence order (lowest → highest).
    pub const ALL: [LayerKind; 5] = [
        LayerKind::Managed,
        LayerKind::User,
        LayerKind::UserLocal,
        LayerKind::Project,
        LayerKind::ProjectLocal,
    ];

    pub fn as_str(self) -> &'static str {
        match self {
            LayerKind::Managed => "managed",
            LayerKind::User => "user",
            LayerKind::UserLocal => "user-local",
            LayerKind::Project => "project",
            LayerKind::ProjectLocal => "project-local",
        }
    }
}

/// Outcome of reading a layer file.
#[derive(Debug, Clone)]
pub enum LayerContent {
    /// File does not exist.
    Absent,
    /// File exists and parsed cleanly.
    Parsed(Value),
    /// File exists but serde_json rejected it. String carries the error with
    /// line/column info. The app refuses to edit malformed files to avoid
    /// destroying content it cannot round-trip.
    ParseError(String),
}

/// One tier of the cascade with its source path, content, and content hash.
/// `hash` is `None` for absent files.
#[derive(Debug, Clone)]
pub struct Layer {
    pub kind: LayerKind,
    pub file: PathBuf,
    pub content: LayerContent,
    pub hash: Option<[u8; 32]>,
}

#[derive(Debug, thiserror::Error)]
pub enum LayerError {
    #[error("I/O error reading {path}: {source}")]
    Io {
        path: PathBuf,
        #[source]
        source: std::io::Error,
    },
}

/// Load a single layer from disk. Missing file → [`LayerContent::Absent`];
/// unparseable file → [`LayerContent::ParseError`] with the error message
/// (both are successful outcomes). Only hard I/O failures (e.g. EACCES)
/// propagate as [`LayerError::Io`].
pub fn load_layer(kind: LayerKind, file: impl Into<PathBuf>) -> Result<Layer, LayerError> {
    let file = file.into();
    match fs::read(&file) {
        Ok(bytes) => {
            let hash = sha256(&bytes);
            let content = match serde_json::from_slice::<Value>(&bytes) {
                Ok(v) => LayerContent::Parsed(v),
                Err(e) => LayerContent::ParseError(e.to_string()),
            };
            Ok(Layer {
                kind,
                file,
                content,
                hash: Some(hash),
            })
        }
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(Layer {
            kind,
            file,
            content: LayerContent::Absent,
            hash: None,
        }),
        Err(source) => Err(LayerError::Io { path: file, source }),
    }
}

/// SHA-256 hash of a byte slice as a fixed 32-byte array.
pub fn sha256(bytes: &[u8]) -> [u8; 32] {
    let mut hasher = Sha256::new();
    hasher.update(bytes);
    hasher.finalize().into()
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    #[test]
    fn layer_kind_all_is_in_precedence_order() {
        assert_eq!(LayerKind::ALL.len(), 5);
        assert_eq!(LayerKind::ALL[0], LayerKind::Managed);
        assert_eq!(LayerKind::ALL[4], LayerKind::ProjectLocal);
    }

    #[test]
    fn layer_kind_as_str_uses_kebab_case() {
        assert_eq!(LayerKind::Managed.as_str(), "managed");
        assert_eq!(LayerKind::User.as_str(), "user");
        assert_eq!(LayerKind::UserLocal.as_str(), "user-local");
        assert_eq!(LayerKind::Project.as_str(), "project");
        assert_eq!(LayerKind::ProjectLocal.as_str(), "project-local");
    }

    #[test]
    fn sha256_of_empty_is_known_constant() {
        // Well-known SHA-256 of the empty string.
        let got = sha256(b"");
        let expected: [u8; 32] = [
            0xe3, 0xb0, 0xc4, 0x42, 0x98, 0xfc, 0x1c, 0x14, 0x9a, 0xfb, 0xf4, 0xc8, 0x99, 0x6f,
            0xb9, 0x24, 0x27, 0xae, 0x41, 0xe4, 0x64, 0x9b, 0x93, 0x4c, 0xa4, 0x95, 0x99, 0x1b,
            0x78, 0x52, 0xb8, 0x55,
        ];
        assert_eq!(got, expected);
    }

    #[test]
    fn absent_file_yields_absent_content_and_no_hash() {
        let layer = load_layer(LayerKind::User, "/tmp/ccsettings-nope-does-not-exist.json")
            .expect("Absent is not an error");
        assert!(matches!(layer.content, LayerContent::Absent));
        assert!(layer.hash.is_none());
        assert_eq!(layer.kind, LayerKind::User);
    }

    #[test]
    fn valid_json_parses_and_records_hash() {
        let dir = tempdir().unwrap();
        let path = dir.path().join("settings.json");
        fs::write(&path, br#"{"model":"opus","env":{"X":"1"}}"#).unwrap();

        let layer = load_layer(LayerKind::Project, &path).unwrap();
        match &layer.content {
            LayerContent::Parsed(v) => {
                assert_eq!(v["model"], "opus");
                assert_eq!(v["env"]["X"], "1");
            }
            other => panic!("expected Parsed, got {other:?}"),
        }
        assert!(layer.hash.is_some());
        assert_eq!(layer.kind, LayerKind::Project);
        assert_eq!(layer.file, path);
    }

    #[test]
    fn invalid_json_yields_parse_error_but_still_hashes() {
        let dir = tempdir().unwrap();
        let path = dir.path().join("broken.json");
        fs::write(&path, b"{ not valid json").unwrap();

        let layer = load_layer(LayerKind::ProjectLocal, &path).unwrap();
        match &layer.content {
            LayerContent::ParseError(msg) => assert!(!msg.is_empty()),
            other => panic!("expected ParseError, got {other:?}"),
        }
        assert!(
            layer.hash.is_some(),
            "hash present even for unparseable files"
        );
    }

    #[test]
    fn hash_is_stable_across_reads() {
        let dir = tempdir().unwrap();
        let path = dir.path().join("stable.json");
        fs::write(&path, br#"{"a":1}"#).unwrap();

        let a = load_layer(LayerKind::User, &path).unwrap();
        let b = load_layer(LayerKind::User, &path).unwrap();
        assert_eq!(a.hash, b.hash);
    }
}
