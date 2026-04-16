# ccsettings

A cross-platform desktop GUI for visualizing and editing Claude Code
settings across every tier of the cascade.

Claude Code reads settings from up to five places — a site-wide managed
file, `~/.claude/settings.json`, `~/.claude/settings.local.json`,
`PROJECT/.claude/settings.json`, and `PROJECT/.claude/settings.local.json`
— plus `~/.claude.json` (MCP user-scope), `PROJECT/.mcp.json`, and the
`CLAUDE.md` / `AGENTS.md` / `GEMINI.md` memory files at each scope.
Understanding which setting is active *and why* usually means reading
five files and reconstructing the merge in your head. ccsettings shows
the effective merged configuration, flags which tier contributed each
value, and lets you edit any tier safely.

## Features

- **Cascade visualization** — five-column header shows exactly what
  each tier (Managed / User / UserLocal / Project / ProjectLocal)
  contributes for the selected category.
- **Eight category editors** — Overview, Permissions, Env (with
  secret-masking for keys matching `TOKEN|KEY|SECRET|PASSWORD|API`),
  Model/flags, Memory (CLAUDE.md/AGENTS.md/GEMINI.md), Plugins
  (toggle enable/disable), Hooks (event × matcher × command with
  danger-pattern lint), MCP (server list + per-tier activation).
- **Safe writes** — every save is an atomic write with a SHA-256
  hash precondition. If the file changed on disk since you loaded
  it, the save is refused with an actionable "Discard and reload /
  Overwrite anyway" banner.
- **Automatic backups** — every write snapshots the prior content.
  A drawer in every editor lists recent snapshots (last 50 or ≤ 7
  days) with one-click restore.
- **Workspace discovery** — import projects from your existing
  Claude Code history (`~/.claude/projects/`) instead of hunting
  for paths manually.
- **Schema-drift surfacing** — an Overview panel lists any
  top-level settings keys the app doesn't recognize so new Claude
  Code keys don't vanish from the UI.

## Install

Download the installer for your platform from the
[releases page](../../releases):

| Platform | File | Notes |
|----------|------|-------|
| macOS (Apple Silicon) | `ccsettings_<version>_aarch64.dmg` | Signed + notarized |
| macOS (Intel)         | `ccsettings_<version>_x64.dmg`     | Signed + notarized |
| Linux (x86_64)        | `ccsettings_<version>_amd64.AppImage` or `.deb` | AppImage is portable |
| Windows (x86_64)      | `ccsettings_<version>_x64-setup.exe` | Unsigned in v1 — SmartScreen will warn on first launch; click "More info" → "Run anyway". |

App data locations:
- Workspace list and prefs: `<OS config dir>/ccsettings/config.json`
- Backup snapshots: `<OS data-local dir>/ccsettings/backups/`

## Build from source

### Prerequisites

- Rust 1.85+ (stable toolchain)
- Node.js 20+ and npm
- On Linux: `libwebkit2gtk-4.1-dev libayatana-appindicator3-dev librsvg2-dev libxdo-dev build-essential`

### Build

```bash
npm install
npm run tauri build            # produces platform installers in src-tauri/target/release/bundle/
```

### Development

```bash
npm run tauri dev              # hot-reload both Rust and the React webview
```

### Tests

```bash
cd src-tauri && cargo test --release   # 77 tests (unit + golden-file cascade fixtures)
npx tsc --noEmit                       # frontend typecheck
npm run build                          # vite production build
```

CI runs the same checks on macOS, Ubuntu, and Windows
(see [`.github/workflows/ci.yml`](.github/workflows/ci.yml)).

## Tech stack

- **Frontend**: React 19 · TypeScript 5 · Vite 7 · Tailwind CSS 3 ·
  zustand · lucide-react · Tauri dialog plugin
- **Backend**: Rust · Tauri 2 · `serde_json` (preserve_order) ·
  `sha2` · `tempfile` · `dirs` · `walkdir` · `time` · `uuid` ·
  `tracing`

## Architecture (at a glance)

```
+------------------+      invoke()       +-------------------+
|  React frontend  | <---------------->  |  Rust backend     |
|  Vite + TS       |   Tauri events      |  Tauri 2          |
|  Tailwind        |                     |  sha2, tempfile   |
|  zustand         |                     |  serde_json       |
+------------------+                     +---------+---------+
                                                   |
                      atomic writes w/             v
                      hash precondition      ~/.claude/*
                      + backups              ~/.claude.json
                                             PROJECT/.claude/*
                                             PROJECT/{CLAUDE.md,.mcp.json}
```

Rust modules (`src-tauri/src/`):

| Module | Responsibility |
|--------|----------------|
| `paths` | Cross-platform resolution of every Claude Code file path |
| `layers` | Independent per-tier loader (hash + parse) |
| `cascade` | Merge engine with per-pointer origin attribution |
| `discovery` | Workspace candidates from `~/.claude/projects/` |
| `plugins` | Installed-plugin registry parser |
| `mcp` | User-scope + project-scope MCP server parser |
| `writers` | Atomic write with SHA-256 hash precondition |
| `backup` | Pre-write snapshots with retention + restore |
| `appconfig` | The app's own persisted workspace list |
| `commands` | Tauri command surface (thin glue layer) |

## License

TBD.
