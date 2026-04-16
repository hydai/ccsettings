//! Workspace discovery via Claude Code's `~/.claude/projects/` directory.
//!
//! Each subdirectory of `projects/` is a slug-encoded absolute path from a
//! prior Claude Code session (e.g. `-Users-hydai-workspace-foo`). The
//! slug is lossy — both `/` and other non-alphanumeric chars map to `-` —
//! so we read the most recent jsonl transcript inside to recover the real
//! `cwd` from its first JSON line. If no transcript is readable, the slug
//! still surfaces (as a candidate the user can edit) with `cwd = None`.

use crate::paths;
use serde::{Deserialize, Serialize};
use std::fs;
use std::io::BufRead;
use std::path::{Path, PathBuf};
use std::time::SystemTime;
use walkdir::WalkDir;

#[derive(Debug, thiserror::Error)]
pub enum DiscoveryError {
    #[error("path resolution failed: {0}")]
    Paths(#[from] paths::PathsError),
    #[error("I/O error at {path}: {source}")]
    Io {
        path: PathBuf,
        #[source]
        source: std::io::Error,
    },
}

/// A project candidate surfaced from `~/.claude/projects/`.
#[derive(Debug, Clone, Serialize)]
pub struct DiscoveredProject {
    /// Raw directory name inside `projects/` (lossy slug).
    pub slug: String,
    /// Absolute path to the slug directory.
    pub slug_dir: PathBuf,
    /// Actual project root as recorded in the most recent transcript.
    /// May be a worktree path; the UI can let the user confirm or adjust.
    pub cwd: Option<PathBuf>,
    /// Most recent transcript mtime; `None` when no transcripts exist.
    pub last_active: Option<SystemTime>,
    /// Number of `.jsonl` transcript files under the slug directory.
    pub transcript_count: usize,
}

/// Discover candidates under the default `~/.claude/projects/` path.
pub fn discover_projects() -> Result<Vec<DiscoveredProject>, DiscoveryError> {
    let root = paths::claude_projects_root()?;
    discover_projects_in(&root)
}

/// Like [`discover_projects`] but takes an explicit root — primarily for tests.
/// A missing root is treated as an empty list (not an error).
pub fn discover_projects_in(root: &Path) -> Result<Vec<DiscoveredProject>, DiscoveryError> {
    let read_dir = match fs::read_dir(root) {
        Ok(rd) => rd,
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Ok(Vec::new()),
        Err(source) => {
            return Err(DiscoveryError::Io {
                path: root.to_path_buf(),
                source,
            });
        }
    };

    let mut out = Vec::new();
    for entry in read_dir {
        let Ok(entry) = entry else { continue };
        let Ok(file_type) = entry.file_type() else {
            continue;
        };
        if !file_type.is_dir() {
            continue;
        }
        let slug = entry.file_name().to_string_lossy().into_owned();
        let slug_dir = entry.path();
        let (cwd, last_active, transcript_count) = scan_transcripts(&slug_dir);
        out.push(DiscoveredProject {
            slug,
            slug_dir,
            cwd,
            last_active,
            transcript_count,
        });
    }

    // Most recent first; slugs with no activity (None) sort to the end.
    out.sort_by(|a, b| match (a.last_active, b.last_active) {
        (Some(ta), Some(tb)) => tb.cmp(&ta),
        (Some(_), None) => std::cmp::Ordering::Less,
        (None, Some(_)) => std::cmp::Ordering::Greater,
        (None, None) => a.slug.cmp(&b.slug),
    });
    Ok(out)
}

fn scan_transcripts(slug_dir: &Path) -> (Option<PathBuf>, Option<SystemTime>, usize) {
    let mut newest: Option<(PathBuf, SystemTime)> = None;
    let mut count = 0usize;

    for entry in WalkDir::new(slug_dir)
        .max_depth(5)
        .into_iter()
        .filter_map(Result::ok)
    {
        if !entry.file_type().is_file() {
            continue;
        }
        if entry.path().extension().and_then(|e| e.to_str()) != Some("jsonl") {
            continue;
        }
        count += 1;
        let mtime = entry.metadata().ok().and_then(|m| m.modified().ok());
        if let Some(mt) = mtime {
            match &newest {
                Some((_, cur)) if mt <= *cur => {}
                _ => newest = Some((entry.path().to_owned(), mt)),
            }
        }
    }

    let cwd = newest
        .as_ref()
        .and_then(|(p, _)| extract_cwd_from_transcript(p));
    let last_active = newest.map(|(_, t)| t);
    (cwd, last_active, count)
}

#[derive(Deserialize)]
struct TranscriptFirstLine {
    cwd: Option<String>,
}

fn extract_cwd_from_transcript(path: &Path) -> Option<PathBuf> {
    let file = fs::File::open(path).ok()?;
    let mut reader = std::io::BufReader::new(file);
    let mut line = String::new();
    reader.read_line(&mut line).ok()?;
    let parsed: TranscriptFirstLine = serde_json::from_str(line.trim()).ok()?;
    parsed.cwd.filter(|s| !s.is_empty()).map(PathBuf::from)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;
    use tempfile::tempdir;

    #[test]
    fn nonexistent_root_yields_empty_list() {
        let res = discover_projects_in(Path::new("/tmp/ccsettings-no-such-root-xxx")).unwrap();
        assert!(res.is_empty());
    }

    #[test]
    fn empty_root_yields_empty_list() {
        let dir = tempdir().unwrap();
        assert!(discover_projects_in(dir.path()).unwrap().is_empty());
    }

    #[test]
    fn slug_without_transcripts_still_appears() {
        let dir = tempdir().unwrap();
        fs::create_dir(dir.path().join("-Users-alice-proj")).unwrap();
        let res = discover_projects_in(dir.path()).unwrap();
        assert_eq!(res.len(), 1);
        assert_eq!(res[0].slug, "-Users-alice-proj");
        assert!(res[0].cwd.is_none());
        assert!(res[0].last_active.is_none());
        assert_eq!(res[0].transcript_count, 0);
    }

    #[test]
    fn cwd_is_extracted_from_first_jsonl_line() {
        let dir = tempdir().unwrap();
        let slug_dir = dir.path().join("-Users-alice-proj");
        let sub = slug_dir.join("sess-1").join("subagents");
        fs::create_dir_all(&sub).unwrap();
        let jsonl = sub.join("agent.jsonl");
        let mut f = fs::File::create(&jsonl).unwrap();
        writeln!(
            f,
            r#"{{"cwd":"/Users/alice/proj","sessionId":"abc","type":"user"}}"#
        )
        .unwrap();
        writeln!(f, r#"{{"type":"assistant"}}"#).unwrap();
        drop(f);

        let res = discover_projects_in(dir.path()).unwrap();
        assert_eq!(res.len(), 1);
        assert_eq!(res[0].cwd.as_deref(), Some(Path::new("/Users/alice/proj")));
        assert_eq!(res[0].transcript_count, 1);
        assert!(res[0].last_active.is_some());
    }

    #[test]
    fn non_jsonl_files_are_ignored() {
        let dir = tempdir().unwrap();
        let slug = dir.path().join("-Users-bob-proj");
        fs::create_dir_all(&slug).unwrap();
        fs::write(slug.join("readme.txt"), b"hello").unwrap();
        fs::write(slug.join("other.json"), b"{}").unwrap();

        let res = discover_projects_in(dir.path()).unwrap();
        assert_eq!(res.len(), 1);
        assert_eq!(res[0].transcript_count, 0);
        assert!(res[0].cwd.is_none());
    }

    #[test]
    fn jsonl_without_cwd_field_yields_none() {
        let dir = tempdir().unwrap();
        let slug = dir.path().join("-some");
        fs::create_dir_all(&slug).unwrap();
        let jsonl = slug.join("orphan.jsonl");
        fs::write(&jsonl, br#"{"type":"assistant"}"#).unwrap();

        let res = discover_projects_in(dir.path()).unwrap();
        assert_eq!(res[0].transcript_count, 1);
        assert!(res[0].cwd.is_none());
    }

    #[test]
    fn plain_files_at_root_are_skipped() {
        let dir = tempdir().unwrap();
        fs::write(dir.path().join("not-a-slug"), b"").unwrap();
        fs::create_dir(dir.path().join("-slug-1")).unwrap();
        let res = discover_projects_in(dir.path()).unwrap();
        assert_eq!(res.len(), 1);
        assert_eq!(res[0].slug, "-slug-1");
    }

    #[test]
    fn sorted_most_recent_first_with_no_activity_trailing() {
        use std::thread::sleep;
        use std::time::Duration;

        let dir = tempdir().unwrap();

        let mk_slug_with_transcript = |name: &str| {
            let slug = dir.path().join(name);
            let sub = slug.join("sess").join("subagents");
            fs::create_dir_all(&sub).unwrap();
            let p = sub.join("a.jsonl");
            fs::write(&p, br#"{"cwd":"/x"}"#).unwrap();
        };

        mk_slug_with_transcript("-older");
        sleep(Duration::from_millis(20));
        mk_slug_with_transcript("-newer");
        // Slug with no transcripts → should sort last.
        fs::create_dir(dir.path().join("-quiet")).unwrap();

        let res = discover_projects_in(dir.path()).unwrap();
        let names: Vec<&str> = res.iter().map(|p| p.slug.as_str()).collect();
        assert_eq!(names, vec!["-newer", "-older", "-quiet"]);
    }
}
