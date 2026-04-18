# Design — About pane with manual updater controls

> Status: **approved** 2026-04-18 after brainstorming session.
> Implementation plan: TBD (will be authored via the `writing-plans` skill in a follow-up step).

## Context

ccsettings v0.1.3 ships with auto-update on by default. The user wants an About pane so:
1. Users can read the version and basic app info without leaving the app.
2. Users who turn off auto-check (or want to verify there's no update outside the startup window) have a clear destination with a manual "Check now" button.
3. The updater toggle stops being an invisible pref — users see it surfaced in a settings-like place.

About is global — it's not workspace-scoped settings — so it needs a placement that's accessible without a workspace selected.

## Decisions

| Question | Decision |
|---|---|
| Placement | Sidebar footer link (below the existing UpdatePill) |
| View routing | New `useUi.view: 'workspace' \| 'about'` field; AppShell switches main pane on it |
| Workspace selection while on About | Selecting a workspace in the sidebar list flips view back to `'workspace'` |
| Content sections | Identity, Updater, Links, Platform, License/Credits |
| Updater controls | "Check now" button, auto-check toggle, "Last checked" timestamp |
| Channel selection | Out of scope (stable-only stays — would need second `latest.json` and is v0.2 territory) |
| "Skip this version" | Out of scope for v1 |
| Platform info source | New Rust command `get_platform_info` (no extra plugin needed) |
| Last-checked persistence | localStorage key `ccsettings:updater:lastCheckedAt` |

## Architecture

```
 [Sidebar About button click] ──► useUi.setView('about')
                                        │
                                        ▼
                           AppShell renders <AboutPane />
                                        │
                                        ▼
              AboutPane mount → invoke('get_platform_info')   (one-shot)
                              → reads useUpdater.* from store (live)
                                        │
                          ┌─────────────┴─────────────┐
                          ▼                           ▼
              [Check now button]              [Auto-check toggle]
              useUpdater.check({manual:true}) useUpdater.setAutoCheck(bool)
                          │
                          ▼
              status transitions; lastCheckedAt updated; banner + pill react

 [Sidebar workspace click] ──► useWorkspaces.select(id) + useUi.setView('workspace')
                                        │
                                        ▼
                           AppShell renders <WorkspacePane />
```

## Components

### Frontend

| File | Change |
|---|---|
| `src/state/ui.ts` | Add `view: 'workspace' \| 'about'` field (default `'workspace'`) and `setView(v)` action |
| `src/state/updater.ts` | Add `lastCheckedAt: number \| null`, persisted to localStorage. Set inside `check()` on every terminal state (success, no-update, error) |
| `src/state/workspaces.ts` | `select(id)` action also calls `useUi.setState({view:'workspace'})` so workspace clicks exit About |
| `src/components/Sidebar.tsx` | Add an "About" button below `<UpdatePill />` in the existing footer div. `onClick={() => useUi.setState({view:'about'})}`. Visual style matches the other ghost-style buttons (Add workspace, Discover) |
| `src/components/AppShell.tsx` | Read `view` from `useUi`. If `view === 'about'`, render `<AboutPane />` in the main element. Otherwise existing flow |
| `src/components/AboutPane.tsx` | **NEW** — five stacked sections, see below |

### Backend

| File | Change |
|---|---|
| `src-tauri/src/commands.rs` | Add `get_platform_info() -> PlatformInfo` returning `{os, arch, tauri_version}`. `os = std::env::consts::OS`, `arch = std::env::consts::ARCH`, `tauri_version = tauri::VERSION` |
| `src-tauri/src/lib.rs` | Register `commands::get_platform_info` in the `invoke_handler!` array |

## AboutPane structure

Top to bottom inside a `space-y-8` container with the same `p-8 max-w-6xl mx-auto` chrome the WorkspacePane uses:

### 1. Identity

```
ccsettings                           [v0.1.3]
A visual companion for Claude Code's layered settings.
```

- App name in `font-display text-3xl font-medium text-ink`.
- Version as a small accent-colored pill showing `v${currentVersion}` from `useUpdater.getState().currentVersion`. Use the same idle-pill colors as `UpdatePill` (`bg-accent/15 text-accent`); not interactive (this is just an info badge, not a button).
- Description copy mirrors the existing `EmptyState` line.

### 2. Updater

Card primary section. State-aware copy:

```
┌──────────────────────────────────────────────────┐
│ Updates                                          │
│                                                  │
│ ✓ You're on the latest version                   │
│ Last checked 5 minutes ago                       │
│                                                  │
│ [ Check for updates ]                            │
│                                                  │
│ ☑ Automatically check on startup                 │
└──────────────────────────────────────────────────┘
```

Copy variations based on `useUpdater.status`:
- `idle` (and lastCheckedAt set, latestVersion null): "✓ You're on the latest version"
- `idle` (lastCheckedAt null): "Hasn't checked yet"
- `checking`: "Checking for updates…"
- `available`: "Update available — v${latestVersion}"
- `downloading` / `installing`: same as banner
- `ready`: "v${latestVersion} ready to install on next launch"
- `error`: "⚠ Last check failed — ${error}"

Below the status text:
- **Check now** primary button → `useUpdater.check({manual:true})`. Disabled while status is `'checking'` (shows "Checking…" spinner).
- **Auto-check toggle** — labeled checkbox / switch. Bound to `useUpdater.autoCheck`, `onChange → setAutoCheck`.

`Last checked` timestamp formatting: relative ("just now", "5 minutes ago", "yesterday") if `lastCheckedAt` is within the last 24h, absolute date otherwise. Compute with `Intl.RelativeTimeFormat` or a small inline helper.

### 3. Links

Three small buttons rendered in a row, each calls `open()` from `@tauri-apps/plugin-opener`:

- **Repository** → `https://github.com/hydai/ccsettings`
- **Issues** → `https://github.com/hydai/ccsettings/issues`
- **This release** → `https://github.com/hydai/ccsettings/releases/tag/v${currentVersion}`

### 4. Platform

Single `text-muted text-xs` line:

```
macOS aarch64 · Tauri 2.10.3
```

Pulled from the new `get_platform_info` command. OS name humanized: `macos` → "macOS", `linux` → "Linux", `windows` → "Windows".

### 5. License + credits

Bottom, smallest text:

```
Apache-2.0 · Built with Tauri, React, and Zustand.
```

## Data shapes

### Rust

```rust
#[derive(Serialize)]
pub struct PlatformInfo {
    pub os: String,           // "macos" | "linux" | "windows"
    pub arch: String,         // "x86_64" | "aarch64"
    pub tauri_version: String,
}

#[tauri::command]
pub fn get_platform_info() -> PlatformInfo {
    PlatformInfo {
        os: std::env::consts::OS.to_string(),
        arch: std::env::consts::ARCH.to_string(),
        tauri_version: tauri::VERSION.to_string(),
    }
}
```

### TypeScript

```ts
// In src/state/ui.ts
export type View = 'workspace' | 'about';
type UiState = {
  category: Category;
  view: View;
  setCategory: (c: Category) => void;
  setView: (v: View) => void;
};

// In src/state/updater.ts (additions only)
type UpdaterState = {
  /* …existing fields… */
  lastCheckedAt: number | null;   // unix ms; persisted
};
```

## Error handling

- `get_platform_info` failing → AboutPane shows "Platform info unavailable" in the platform line; rest of pane still renders.
- `check()` failing in About → existing error-surfacing kicks in (status='error', error message). AboutPane's updater section reflects via the state-aware copy.
- `open()` of an external URL failing → silent (matches existing `tauri-plugin-opener` behavior elsewhere in the app).
- About selected before any workspace exists → still works; doesn't depend on workspace state. UpdatePill in sidebar still renders.

## Testing

### Local dev

```bash
cd src-tauri && cargo fmt --check && cargo clippy --release --all-targets -- -D warnings && cargo test --release
cd .. && npx tsc --noEmit && npm run build
npm run tauri dev
```

Manual smoke:
1. Launch dev. Click "About" in sidebar footer → AboutPane renders, all 5 sections visible.
2. Identity shows correct version (`v0.1.3` or whatever `package.json` reports).
3. Click "Check now" → button disables, "Checking…" appears, then either "You're on the latest version" or "Update available — v…" with `lastCheckedAt` updated.
4. Toggle auto-check off → reload app → confirm toggle stays off (localStorage `ccsettings:updater:autoCheck`).
5. Click "Repository" → external browser opens to the GitHub repo.
6. Click a workspace in sidebar list → view flips back to workspace, About content unmounts.
7. Click About again → state is fresh (cycles through correctly).
8. Force `useUpdater.setState({status:'error', error:'…'})` in devtools → confirm About's updater card shows the error copy in red.

### Edge cases

- App with zero workspaces: open About → renders fine, no broken references.
- Toggle auto-check while a check is in flight: takes effect for next startup; current check completes normally.
- Click "Check now" twice in quick succession: second click is no-op (button disabled while status === 'checking').

## Scope boundaries

**In scope:**
- Sidebar footer "About" entry + view-mode routing.
- 5-section AboutPane.
- New `get_platform_info` Rust command + invoke handler entry.
- `lastCheckedAt` field on the updater store with localStorage persistence.
- "Last checked X ago" relative-time formatting.

**Out of scope (deliberate):**
- Channel selection (stable / beta) — needs a second `latest.json` published from CI; v0.2 feature.
- "Skip this version" — adds a persisted skipped-version field; can be a follow-up.
- Real-time relative-time refresh (e.g., `"just now"` ticking to `"a minute ago"` while pane is open) — for v1 the timestamp is computed once on render; users can navigate away and back to refresh.
- Build timestamp — not exposed; current-version + Tauri-version is enough for bug reports.
- App update history / release-notes-inline — `Repository` and `This release` links cover this externally.

## Follow-up work

If About lands and proves useful, natural next PRs:
- Beta channel toggle — second `latest.json` endpoint, radio in About's Updater section.
- "Skip this version" — small button next to dismiss, persisted across sessions.
- Build timestamp via build.rs `env!("BUILD_TIMESTAMP")`.
