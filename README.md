# ccsettings

GUI application to visualize and edit Claude Code settings across system, project, and local tiers.

Cross-platform Tauri 2 desktop app (macOS, Windows, Linux) that reads settings from `~/.claude/`, `PROJECT/.claude/`, and `PROJECT/.claude/*.local.json`, renders the effective merged configuration with origin attribution, and provides typed editors for every category (permissions, hooks, env, model/flags, memory, plugins, MCP) with safe edit/save (atomic writes, SHA-256 precondition, backups, undo).

## Tech stack

- **Frontend**: React 19 + TypeScript 5 + Vite 7 + Tailwind CSS + shadcn/ui + zustand + react-hook-form + ajv
- **Backend**: Rust + Tauri 2 (`notify-debouncer-full`, `serde_json` w/ `preserve_order`, `jsonschema`, `sha2`, `dirs`)

## Development

```bash
npm install                            # install frontend deps
npm run tauri dev                      # dev with hot reload
npm run tauri build                    # production bundle
cd src-tauri && cargo test --release   # backend tests (release profile per project policy)
```

## Status

Phase 1 scaffolding in progress. See `/Users/hydai/.claude/plans/purrfect-dancing-map.md` for the full design.
