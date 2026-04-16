//! Read-only MCP server registry parser.
//!
//! MCP server definitions live in two places:
//! - `~/.claude.json` (user scope, sibling of `~/.claude/`) — a larger
//!   Claude Code state file that contains an `mcpServers` object among other
//!   things. We only read this, never write it, because other parts of the
//!   file are maintained by Claude Code itself.
//! - `<project>/.mcp.json` (project scope) — a dedicated file whose top
//!   level is `{ "mcpServers": { ... } }`.
//!
//! Activation (which of the defined servers is actually enabled for a
//! project) is layered via `enabledMcpjsonServers`/`disabledMcpjsonServers`
//! arrays inside each settings.json tier — handled in the commands layer.

use serde_json::Value;
use std::fs;
use std::path::Path;

#[derive(Debug, thiserror::Error)]
pub enum McpError {
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
}

/// Load the `mcpServers` object from a file whose top level contains that key.
/// Works for both `~/.claude.json` and `<project>/.mcp.json`.
/// Missing file → empty map (not an error). Missing key → empty map.
pub fn load_mcp_servers(path: &Path) -> Result<serde_json::Map<String, Value>, McpError> {
    let bytes = match fs::read(path) {
        Ok(b) => b,
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => {
            return Ok(serde_json::Map::new());
        }
        Err(source) => {
            return Err(McpError::Io {
                path: path.to_path_buf(),
                source,
            });
        }
    };
    let raw: Value = serde_json::from_slice(&bytes).map_err(|source| McpError::Parse {
        path: path.to_path_buf(),
        source,
    })?;
    match raw.get("mcpServers") {
        Some(Value::Object(obj)) => Ok(obj.clone()),
        _ => Ok(serde_json::Map::new()),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    #[test]
    fn missing_file_returns_empty_map() {
        let servers = load_mcp_servers(Path::new("/tmp/ccsettings-no-mcp-xxx.json")).unwrap();
        assert!(servers.is_empty());
    }

    #[test]
    fn file_without_mcp_servers_key_returns_empty_map() {
        let dir = tempdir().unwrap();
        let path = dir.path().join(".claude.json");
        fs::write(&path, br#"{"otherStuff": 42}"#).unwrap();
        let servers = load_mcp_servers(&path).unwrap();
        assert!(servers.is_empty());
    }

    #[test]
    fn extracts_mcp_servers_from_user_scope_file() {
        let dir = tempdir().unwrap();
        let path = dir.path().join(".claude.json");
        fs::write(
            &path,
            br#"{
                "someOtherField": true,
                "mcpServers": {
                    "pencil":  { "type": "stdio", "command": "node",   "args": ["./srv.js"] },
                    "discord": { "type": "http",  "url": "https://x/mcp" }
                }
            }"#,
        )
        .unwrap();
        let servers = load_mcp_servers(&path).unwrap();
        assert_eq!(servers.len(), 2);
        assert_eq!(servers["pencil"]["command"], "node");
        assert_eq!(servers["discord"]["type"], "http");
    }

    #[test]
    fn extracts_mcp_servers_from_project_mcp_json() {
        let dir = tempdir().unwrap();
        let path = dir.path().join(".mcp.json");
        fs::write(
            &path,
            br#"{
                "mcpServers": {
                    "local": { "type": "stdio", "command": "uvx", "args": ["local-mcp"] }
                }
            }"#,
        )
        .unwrap();
        let servers = load_mcp_servers(&path).unwrap();
        assert_eq!(servers.len(), 1);
        assert_eq!(servers["local"]["command"], "uvx");
    }

    #[test]
    fn malformed_json_surfaces_parse_error_with_path() {
        let dir = tempdir().unwrap();
        let path = dir.path().join("bad.json");
        fs::write(&path, b"{ not json").unwrap();
        let err = load_mcp_servers(&path).unwrap_err();
        match err {
            McpError::Parse { path: p, .. } => assert_eq!(p, path),
            other => panic!("expected Parse error, got {other:?}"),
        }
    }
}
