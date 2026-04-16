//! Cross-platform resolution of Claude Code settings file locations.
//!
//! Given a project root, this module computes where every file the app reads
//! or writes lives — independent of whether those files exist on disk.
//! Layer loading and existence checks live in `crate::layers`.

use std::path::{Path, PathBuf};

#[derive(Debug, thiserror::Error)]
pub enum PathsError {
    #[error("could not resolve home directory")]
    NoHomeDir,
    #[error("could not resolve OS config directory")]
    NoConfigDir,
    #[error("could not resolve OS data-local directory")]
    NoDataDir,
}

/// Claude Code recognizes three memory files at each scope; all are plain text.
#[derive(Debug, Clone)]
pub struct MemoryPaths {
    pub claude: PathBuf,
    pub agents: PathBuf,
    pub gemini: PathBuf,
}

/// Files under the user's home directory. The `claude_json` field lives
/// OUTSIDE `claude_dir` — MCP user-scope config is at `~/.claude.json`.
#[derive(Debug, Clone)]
pub struct UserPaths {
    pub claude_dir: PathBuf,
    pub settings: PathBuf,
    pub settings_local: PathBuf,
    pub memory: MemoryPaths,
    pub plugins_dir: PathBuf,
    pub installed_plugins: PathBuf,
    pub known_marketplaces: PathBuf,
    pub claude_json: PathBuf,
}

/// Files within a specific project root.
#[derive(Debug, Clone)]
pub struct ProjectPaths {
    pub root: PathBuf,
    pub claude_dir: PathBuf,
    pub settings: PathBuf,
    pub settings_local: PathBuf,
    pub memory: MemoryPaths,
    pub mcp: PathBuf,
}

/// All paths needed to render and edit one project's cascaded settings.
#[derive(Debug, Clone)]
pub struct WorkspacePaths {
    pub user: UserPaths,
    pub project: ProjectPaths,
}

impl WorkspacePaths {
    pub fn new(project_root: impl Into<PathBuf>) -> Result<Self, PathsError> {
        let user = resolve_user_paths()?;
        let project = resolve_project_paths(project_root.into());
        Ok(Self { user, project })
    }
}

fn resolve_user_paths() -> Result<UserPaths, PathsError> {
    let home = dirs::home_dir().ok_or(PathsError::NoHomeDir)?;
    let claude_dir = home.join(".claude");
    let plugins_dir = claude_dir.join("plugins");
    Ok(UserPaths {
        settings: claude_dir.join("settings.json"),
        settings_local: claude_dir.join("settings.local.json"),
        memory: MemoryPaths {
            claude: claude_dir.join("CLAUDE.md"),
            agents: claude_dir.join("AGENTS.md"),
            gemini: claude_dir.join("GEMINI.md"),
        },
        installed_plugins: plugins_dir.join("installed_plugins.json"),
        known_marketplaces: plugins_dir.join("known_marketplaces.json"),
        plugins_dir,
        claude_json: home.join(".claude.json"),
        claude_dir,
    })
}

fn resolve_project_paths(root: PathBuf) -> ProjectPaths {
    let claude_dir = root.join(".claude");
    ProjectPaths {
        settings: claude_dir.join("settings.json"),
        settings_local: claude_dir.join("settings.local.json"),
        memory: MemoryPaths {
            claude: root.join("CLAUDE.md"),
            agents: root.join("AGENTS.md"),
            gemini: root.join("GEMINI.md"),
        },
        mcp: root.join(".mcp.json"),
        claude_dir,
        root,
    }
}

/// `~/.claude/` for the current user.
pub fn user_claude_dir() -> Result<PathBuf, PathsError> {
    Ok(dirs::home_dir()
        .ok_or(PathsError::NoHomeDir)?
        .join(".claude"))
}

/// `~/.claude.json` — MCP user-scope config (NOT inside `~/.claude/`).
pub fn user_claude_json() -> Result<PathBuf, PathsError> {
    Ok(dirs::home_dir()
        .ok_or(PathsError::NoHomeDir)?
        .join(".claude.json"))
}

/// `~/.claude/projects/` — Claude Code's per-project transcript storage.
/// Used for workspace discovery ("projects you've worked on").
pub fn claude_projects_root() -> Result<PathBuf, PathsError> {
    Ok(user_claude_dir()?.join("projects"))
}

/// The app's own config directory: `<OS config dir>/ccsettings/`.
pub fn app_config_dir() -> Result<PathBuf, PathsError> {
    Ok(dirs::config_dir()
        .ok_or(PathsError::NoConfigDir)?
        .join("ccsettings"))
}

/// The app's own data-local directory: `<OS data-local dir>/ccsettings/`.
pub fn app_data_dir() -> Result<PathBuf, PathsError> {
    Ok(dirs::data_local_dir()
        .ok_or(PathsError::NoDataDir)?
        .join("ccsettings"))
}

#[cfg(windows)]
pub fn display_path(p: &Path) -> String {
    let s = p.to_string_lossy();
    let s_ref: &str = &s;
    let trimmed = s_ref.strip_prefix(r"\\?\").unwrap_or(s_ref);
    trimmed.replace('\\', "/")
}

#[cfg(not(windows))]
pub fn display_path(p: &Path) -> String {
    p.to_string_lossy().into_owned()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn workspace_paths_place_files_under_expected_dirs() {
        let root = PathBuf::from("/tmp/some/project");
        let ws = WorkspacePaths::new(&root).expect("home resolvable");

        assert_eq!(ws.project.root, root);
        assert_eq!(ws.project.settings, root.join(".claude/settings.json"));
        assert_eq!(
            ws.project.settings_local,
            root.join(".claude/settings.local.json")
        );
        assert_eq!(ws.project.memory.claude, root.join("CLAUDE.md"));
        assert_eq!(ws.project.memory.agents, root.join("AGENTS.md"));
        assert_eq!(ws.project.memory.gemini, root.join("GEMINI.md"));
        assert_eq!(ws.project.mcp, root.join(".mcp.json"));

        assert!(ws.user.settings.ends_with(".claude/settings.json"));
        assert!(ws
            .user
            .settings_local
            .ends_with(".claude/settings.local.json"));
        assert!(ws.user.memory.claude.ends_with(".claude/CLAUDE.md"));
        assert!(ws
            .user
            .installed_plugins
            .ends_with("plugins/installed_plugins.json"));
        assert!(ws
            .user
            .known_marketplaces
            .ends_with("plugins/known_marketplaces.json"));
    }

    #[test]
    fn user_claude_json_is_outside_claude_dir() {
        let dir = user_claude_dir().unwrap();
        let file = user_claude_json().unwrap();
        assert!(file.ends_with(".claude.json"));
        assert!(
            file.parent() == dir.parent(),
            "expected {file:?} to be a sibling of {dir:?}"
        );
    }

    #[test]
    fn claude_projects_root_is_under_claude_dir() {
        let root = claude_projects_root().unwrap();
        assert!(root.ends_with("projects"));
        assert_eq!(root.parent().unwrap(), user_claude_dir().unwrap());
    }

    #[test]
    fn app_dirs_contain_ccsettings_segment() {
        assert!(app_config_dir().unwrap().ends_with("ccsettings"));
        assert!(app_data_dir().unwrap().ends_with("ccsettings"));
    }

    #[cfg(not(windows))]
    #[test]
    fn display_path_passes_posix_paths_through() {
        assert_eq!(display_path(Path::new("/tmp/foo/bar")), "/tmp/foo/bar");
    }

    #[cfg(windows)]
    #[test]
    fn display_path_normalizes_windows_paths() {
        assert_eq!(display_path(Path::new(r"C:\Users\foo")), "C:/Users/foo");
        assert_eq!(
            display_path(Path::new(r"\\?\C:\Users\foo\bar")),
            "C:/Users/foo/bar"
        );
    }
}
