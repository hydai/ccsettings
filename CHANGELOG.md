# Changelog

Conventional-commits–driven notes. Dates are UTC.

## Unreleased

(Nothing yet — changes after v0.1.3 land here.)

## v0.1.3 — 2026-04-18

UX recovery hint for the in-app updater's "installing" state. After 5
seconds in the installing state with no auto-restart, the banner now
shows: "Installing… If this doesn't restart in a moment, quit (⌘Q)
and reopen to finish." Gives users on broken or hung installs a
visible escape hatch instead of an indefinitely spinning banner.

## v0.1.2 — 2026-04-18

Fix for a v0.1.1 bug discovered immediately after release: on macOS
the in-app updater would download and install the new bundle, but
never restart the app — leaving the UI frozen at "Installing —
ccsettings will restart…" while the .app on disk had actually been
replaced. Users had to quit and reopen manually.

- **Explicit relaunch via `tauri-plugin-process`**: after
  `downloadAndInstall()` completes, `relaunch()` is now called to
  start the new binary. Applies to both the in-session install flow
  and the pre-mount "install on next launch" consumption.

## v0.1.1 — 2026-04-18

First stable release with the in-app auto-updater. Functionally
identical to v0.1.1-rc.1 after the pipeline-validation cut — see that
section below for the feature inventory.

Caveat the rc.1 cycle exposed: pre-existing v0.1.0 instances cannot
self-update to this release because v0.1.0 predates the updater
feature. v0.1.0 users need to install v0.1.1 manually once; from
v0.1.1 onward, future updates flow through the in-app updater.

**Known issue (fixed in v0.1.2):** the in-app updater downloads and
installs new versions correctly on macOS but does not auto-restart —
users see "Installing — ccsettings will restart…" indefinitely. Quit
(⌘Q) and reopen manually to land on the new version. v0.1.2 ships an
explicit `relaunch()` call that fixes this. (For installs in
`/Applications`, also look for a hidden macOS admin password prompt
behind the app window before quitting.)

## v0.1.1-rc.1 — 2026-04-18

First release candidate with the in-app updater. Primarily a pipeline
validation — exercises the signed bundle + `latest.json` manifest flow
before the stable v0.1.1 cut. Highlights versus v0.1.0:

- **In-app auto-updater** via `tauri-plugin-updater`: on-startup
  check + a manual "Check now" pill in the sidebar footer. Download,
  Ed25519 signature verification, install, and relaunch happen inside
  the app — no browser jumps.
- **Sidebar footer pill** (`v0.1.2 ↑` / `⚠ Retry`) and a top banner
  in the conflict-banner idiom surface update state. Banner offers
  "Install & restart now" and "Install on next launch".
- **Stable-only channel**: prerelease tags (like this one) are
  filtered out of the GitHub-hosted `latest.json` endpoint.
- **Signed release bundles**: `release.yml` now receives the
  `TAURI_SIGNING_PRIVATE_KEY` secret, emits per-platform `.sig`
  sidecars, and a new `publish-manifest` job assembles `latest.json`
  using `jq` (raw minisign signature content, properly JSON-escaped).

## v0.1.0 — 2026-04-17

First stable release. Functionally identical to v0.1.0-rc.1 after
smoke-testing the release-candidate artifacts — see that section
below for the full feature list. Installers ship unsigned on macOS
and Windows; re-enable signing by populating the `APPLE_*` repo
secrets (the release workflow picks them up automatically).

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
