# Changelog

Conventional-commits–driven notes. Dates are UTC.

## Unreleased

(Nothing yet — changes after v0.1.0-rc.1 land here.)

## v0.1.0-rc.1 — 2026-04-17

First release candidate. Exercises the tauri-action build +
artifact-upload pipeline end-to-end. Highlights:

### Visualization

- Five-column cascade header showing which tier (Managed / User /
  UserLocal / Project / ProjectLocal) contributes every top-level
  settings key for the selected category.
- Overview tab renders the effective merged JSON plus an
  Unknown-keys panel that surfaces schema drift — any top-level
  settings key the app doesn't have a typed editor for is listed
  with an inspectable value.

### Editors (eight categories)

- **Permissions** — allow / deny / ask lists with per-tier writes.
- **Env** — key/value rows with automatic secret masking for keys
  matching `TOKEN|KEY|SECRET|PASSWORD|API`; per-session reveal
  toggle; warns before writing a masked value to the committed
  Project tier.
- **Model** — `model`, `outputStyle`, `effortLevel`,
  `alwaysThinkingEnabled`, `includeCoAuthoredBy` with explicit
  inherit / set / clear controls per field.
- **Memory** — CLAUDE.md / AGENTS.md / GEMINI.md at user and
  project scope; creates the file on first save.
- **Plugins** — installed-plugin list with per-tier tri-state
  toggle (inherit / on / off). Enablement writes to
  `settings.json.enabledPlugins` at the selected tier; plugin
  install state stays in `~/.claude/plugins/installed_plugins.json`.
- **Hooks** — flat-row editor for event × matcher × command.
  Groups rows back into Claude Code's nested shape on save. Six
  built-in danger-pattern lints (recursive rm, `curl | sh`, `sudo`,
  fork bomb, `mkfs` / `dd` / `shred`, `wget | sh`).
- **MCP** — lists servers from both `~/.claude.json` (user scope,
  read-only) and `<project>/.mcp.json` (project scope) with per-tier
  enable / disable toggles written to
  `settings.json.{enabled,disabled}McpjsonServers`.

### Safety

- Every write is atomic (same-directory tempfile, fsync, rename).
- Every write is gated on a SHA-256 precondition that matches the
  bytes the editor loaded. External modifications surface as an
  actionable conflict banner with "Discard and reload" and
  "Overwrite anyway" buttons.
- Every write captures a pre-write backup under
  `<data_dir>/ccsettings/backups/`. Retention: last 50 files or
  anything ≤ 7 days, whichever is more inclusive. Each editor has a
  Backups drawer listing snapshots with one-click restore.
- Force-overwrite still captures the prior content first, so any
  "Overwrite anyway" decision is still one click away from being
  reverted via the Backups drawer.

### Workspaces

- Manual add via folder picker, drag-and-drop, or paste-path.
- "Discover from Claude Code history" reads
  `~/.claude/projects/` and extracts real project paths from
  transcript `cwd` fields (since the slug encoding is lossy).
- Workspace list is persisted to
  `<config_dir>/ccsettings/config.json`.

### Platforms

- macOS (arm64 + x86_64) — signed + notarized installer.
- Linux (x86_64) — AppImage (portable) and .deb.
- Windows (x86_64) — NSIS installer, unsigned in v1; SmartScreen
  workaround documented in the release notes.

### Tests

- 67 Rust unit tests + 10 golden cascade-fixture tests.
- `cargo clippy --release --all-targets -- -D warnings` is clean.
- TypeScript strict mode; vite production build green in CI.
- CI matrix: macOS, Ubuntu, Windows.

## How to read this file going forward

Entries under **Unreleased** move into a dated version section
(`## v1.0.0 — 2026-04-17`, etc.) when the `v*.*.*` tag is cut.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
