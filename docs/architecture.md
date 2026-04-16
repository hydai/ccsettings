# Architecture

## Overview

ccsettings is a two-process Tauri 2 desktop app: a Rust binary that
owns all file I/O and a React webview that renders the UI. They
communicate over Tauri's `invoke` channel (JS → Rust) and event
stream (Rust → JS).

```
+------------------+      invoke()       +---------------------+
|  React frontend  | <----------------->  |  Rust backend      |
|  Vite + TS       |                      |  Tauri 2           |
|  Tailwind v3     |                      |  (cascade, paths,  |
|  zustand         |                      |   layers, writers, |
|  lucide-react    |                      |   backup, ...)     |
+--------+---------+                      +----------+---------+
         |                                           |
         |                                           v
         | renders                           atomic writes +
         | cascade view +                    hash precondition +
         | category editors                  pre-write backups
                                                     |
                                                     v
                         ~/.claude/{settings.json, settings.local.json,
                                    CLAUDE.md, plugins/*}
                         ~/.claude.json              (MCP user-scope)
                         PROJECT/.claude/{settings.json, settings.local.json}
                         PROJECT/{CLAUDE.md, AGENTS.md, .mcp.json}
                         <data_dir>/ccsettings/backups/        (ours)
                         <config_dir>/ccsettings/config.json   (ours)
```

One Rust crate, one React app, no Cargo workspace. The whole Rust
binary is under `src-tauri/`; the frontend lives at the repo root
(`src/`, `index.html`, `vite.config.ts`, `package.json`).

## Rust module map (`src-tauri/src/`)

| Module | Responsibility |
|--------|----------------|
| `paths` | Resolve every Claude Code file path per platform. All cross-platform concerns (home dir, long-path prefix, forward-slash normalization) live here. |
| `layers` | Load a single settings tier from disk. Produces `Layer { kind, file, content, hash }`. Handles missing-file and parse-error as first-class states. |
| `cascade` | Merge N `Layer`s into a `MergedView` with per-JSON-Pointer origin attribution. See [cascade-rules.md](./cascade-rules.md). |
| `discovery` | List candidate projects from `~/.claude/projects/` by reading `cwd` from the first line of each session transcript. |
| `plugins` | Parse `~/.claude/plugins/installed_plugins.json`. Read-only; activation happens via `settings.json.enabledPlugins`. |
| `mcp` | Parse the `mcpServers` object from `~/.claude.json` (user-scope) and `<project>/.mcp.json` (project-scope). Read-only; activation via `settings.json.{enabled,disabled}McpjsonServers`. |
| `writers` | `atomic_write_if(path, bytes, expected_hash)` — the only place in the codebase that writes to user files. Enforces the hash precondition and atomic rename. |
| `backup` | Pre-write snapshots with retention (50 files OR ≤ 7 days), plus list and restore helpers. Hooked into `writers::atomic_write_if`. |
| `appconfig` | The app's own persisted state (workspaces, theme) at `<config_dir>/ccsettings/config.json`. |
| `commands` | Thin glue between Tauri's `invoke` and the modules above. All DTOs for the frontend live here. |

## Frontend structure (`src/`)

| Path | What |
|------|------|
| `App.tsx` | Root — renders `AppShell`. |
| `components/AppShell.tsx` | Two-pane shell: `Sidebar` + main pane with `CategoryPicker` and `CategoryView`. |
| `components/Sidebar.tsx` | Workspace list with add (folder picker / drag-drop / paste). |
| `components/CategoryPicker.tsx` | Eight-tab bar above the main pane. |
| `components/CategoryView.tsx` | Dispatches to the active category's editor. |
| `components/CascadeHeader.tsx` | Five-column tier breakdown for Overview. |
| `components/UnknownKeysPanel.tsx` | Schema-drift surfacing in Overview. |
| `components/{Permissions,Env,Model,Memory,Plugins,Hooks,Mcp}Editor.tsx` | Per-category editors. |
| `components/TierPicker.tsx` | Shared radio row for selecting write target. |
| `components/SaveControls.tsx` | Shared Save / Discard / conflict banner. |
| `components/BackupsList.tsx` | Shared collapsible backup browser with restore. |
| `state/workspaces.ts` | zustand store — workspace CRUD + selection. |
| `state/cascade.ts` | zustand store — per-workspace merged view. |
| `state/layerContent.ts` | Typed wrappers for `get_layer_content` / `save_layer`. |
| `state/ui.ts` | Selected category tab. |
| `types.ts` | Mirrors of the Rust DTOs (`Workspace`, `MergedView`, `Contributor`, `LayerKind`, etc.). |
| `lib/cn.ts` | `clsx` + `tailwind-merge` composition helper. |
| `lib/layers.ts` | Tier constants (labels, colors, writable set). |

## Data flow

1. **Workspace selection** changes the `selectedId` in the
   `workspaces` store.
2. `AppShell` observes this and calls `useCascade().load(id)`, which
   invokes `get_cascade` in Rust. Rust loads all five tiers and runs
   the merge engine.
3. `CascadeHeader` derives per-tier top-level-key contributions from
   `MergedView.origins`. `CategoryView` renders the active editor.
4. **Editors** invoke `get_layer_content(workspaceId, layer)` (or
   `read_memory_file`) to fetch the *target tier's* full JSON plus
   its hash, which becomes the edit snapshot.
5. **Save** calls `save_layer(workspaceId, layer, newValue,
   expectedHash)`. Rust runs `writers::atomic_write_if`, which
   validates the hash, captures a pre-write backup, and atomically
   renames the tempfile.
6. On success, the editor re-fetches the tier and invalidates the
   cascade so the header and Overview catch up.
7. On `"conflict:"`, `SaveControls` shows the Discard / Overwrite
   banner.

## Tests

- **Unit tests** in each Rust module. 67 currently covering
  path resolution, layer loading, merge rules, discovery, plugins
  parsing, MCP parsing, atomic write semantics, backup retention,
  and command-layer DTO conversions.
- **Golden integration tests** at `src-tauri/tests/cascade_golden.rs`
  drive 10 end-to-end fixtures under `tests/fixtures/cascade/`. Each
  fixture has up to five `layers/*.json` files and an `expected.json`;
  the test runner loads, merges, and asserts structural equality.
- **Frontend**: TypeScript strict mode + `tsc --noEmit` in CI.
  Unit tests for the editors are a future add; the value-to-cost
  ratio there is lower since the Rust side is already well covered
  and the editors are thin UI over well-tested backends.

## Cross-platform notes

- **Paths**: everything goes through `dirs` (`home_dir`,
  `config_dir`, `data_local_dir`). Display paths use forward slashes
  on all platforms; storage uses OS-native separators. Windows
  `\\?\` long-path prefixes are stripped on display.
- **Bundle targets**: macOS dmg+app, Windows NSIS, Linux AppImage+deb.
  See `src-tauri/tauri.conf.json`.
- **Code signing**: macOS uses Apple Developer ID + notarization via
  `APPLE_*` env vars. Windows is unsigned in v1 — a documented
  SmartScreen workaround lives in the release notes. Linux is
  unsigned AppImage.

## Non-goals for v1

- Editing `~/.claude.json` MCP definitions (Claude Code owns that file)
- Editing hook types other than `{ type: "command" }`
- Schema validation of malformed existing files (typed editors cover
  most structural concerns; bundle-size cost vs value is marginal)
- Cross-device sync
- Managed-settings editing (read-only)
- Session transcript browsing (`~/.claude/projects/*.jsonl`)

## Further reading

- [cascade-rules.md](./cascade-rules.md) — authoritative merge rules
- [edit-flow.md](./edit-flow.md) — load → edit → save → conflict flow
