# About Pane Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a sidebar-footer-accessible About pane showing app identity, version, manual updater controls (Check now + auto-check toggle + last-checked time), repo/issues/release links, platform info, and license/credits.

**Architecture:** New `useUi.view: 'workspace' | 'about'` field routes the main pane between the existing `WorkspacePane` and a new `AboutPane`. Sidebar footer gets an "About" button. Selecting a workspace flips view back to workspace. Updater store gains `lastCheckedAt` (localStorage-persisted). Backend gets a `get_platform_info` command for the OS/arch/Tauri-version line.

**Tech Stack:** Rust + Tauri 2 (commands.rs invoke handler), TypeScript + React + zustand, Tailwind (existing tokens only), `@tauri-apps/api/core::invoke`, `@tauri-apps/plugin-opener` (already a dep) for external links.

**Design spec:** `docs/superpowers/specs/2026-04-18-about-page-design.md` (read before starting).

**Note on testing:** No frontend test framework in the repo (intentional per spec). Verification is `cargo fmt/clippy/test` for Rust, `tsc --noEmit + vite build` for TS, and `npm run tauri dev` smoke-test against the running app for UI behavior.

---

## Task 1: Backend `get_platform_info` command

**Files:**
- Modify: `src-tauri/src/commands.rs` (add struct + command at the end)
- Modify: `src-tauri/src/lib.rs` (add to `invoke_handler!` array)

- [ ] **Step 1: Add the `PlatformInfo` struct + command at the bottom of `src-tauri/src/commands.rs`**

Open `src-tauri/src/commands.rs`. Append (after the last existing command, before the file ends):

```rust
/// OS / arch / Tauri runtime info for the About pane.
/// Read at runtime; no allocation surprises since all three values are
/// compile-time constants.
#[derive(Serialize)]
pub struct PlatformInfo {
    pub os: String,
    pub arch: String,
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

(`Serialize` is already imported at the top of the file via `use serde::{Deserialize, Serialize};`.)

- [ ] **Step 2: Register the command in `src-tauri/src/lib.rs`**

Open `src-tauri/src/lib.rs`. Find the `tauri::generate_handler![…]` invocation inside the builder chain. Add `commands::get_platform_info` to the list, alphabetically-ish (after `commands::get_mcp_state` works fine):

```rust
.invoke_handler(tauri::generate_handler![
    commands::list_workspaces,
    commands::add_workspace,
    commands::remove_workspace,
    commands::rename_workspace,
    commands::discover_workspaces_from_history,
    commands::get_cascade,
    commands::get_layer_content,
    commands::save_layer,
    commands::read_memory_file,
    commands::save_memory_file,
    commands::get_plugins_state,
    commands::get_mcp_state,
    commands::get_platform_info,
    commands::list_backups_for_layer,
    commands::list_backups_for_memory,
    commands::restore_backup,
])
```

- [ ] **Step 3: Verify Rust compiles + clippy + tests**

```bash
cd src-tauri
cargo fmt --all -- --check
cargo clippy --release --all-targets -- -D warnings
cargo test --release
```

Expected: all pass. `tauri::VERSION` exists as `pub const VERSION: &str = "x.y.z"` in tauri ≥ 2.0. If clippy complains about `tauri::VERSION` being missing, fall back to `option_env!("CARGO_PKG_VERSION").unwrap_or("unknown").to_string()` (gives the app's version as a stand-in) and note it in the commit message.

- [ ] **Step 4: Commit**

```bash
cd /Users/hydai/workspace/vibe/ccsettings
git add src-tauri/src/commands.rs src-tauri/src/lib.rs
git commit -m "feat(about): add get_platform_info command for OS/arch/Tauri version"
```

---

## Task 2: Add `view` field to `useUi` store

**Files:**
- Modify: `src/state/ui.ts`

- [ ] **Step 1: Replace `src/state/ui.ts` contents**

Open `src/state/ui.ts` and replace the entire file with:

```ts
import { create } from "zustand";

export type Category =
  | "overview"
  | "permissions"
  | "env"
  | "model"
  | "memory"
  | "plugins"
  | "hooks"
  | "mcp";

export type View = "workspace" | "about";

type UiState = {
  category: Category;
  view: View;
  setCategory: (c: Category) => void;
  setView: (v: View) => void;
};

export const useUi = create<UiState>((set) => ({
  category: "overview",
  view: "workspace",
  setCategory: (category) => set({ category }),
  setView: (view) => set({ view }),
}));
```

- [ ] **Step 2: Verify typecheck**

```bash
npx tsc --noEmit
```

Expected: passes.

- [ ] **Step 3: Commit**

```bash
git add src/state/ui.ts
git commit -m "feat(about): add view='workspace'|'about' field to useUi store"
```

---

## Task 3: Add `lastCheckedAt` to `useUpdater` store

**Files:**
- Modify: `src/state/updater.ts`

The new field is a unix-millis timestamp set inside `check()` on every terminal state (success-no-update, success-with-update, error). Persisted to localStorage so users see "last checked yesterday" across restarts.

- [ ] **Step 1: Add storage helpers near the existing localStorage helpers in `src/state/updater.ts`**

Find the block of `AUTO_CHECK_KEY` / `PENDING_INSTALL_KEY` constants and helpers near the top of the file. After `setPendingInstall()`, add:

```ts
const LAST_CHECKED_KEY = "ccsettings:updater:lastCheckedAt";

function readLastCheckedAt(): number | null {
  try {
    const raw = localStorage.getItem(LAST_CHECKED_KEY);
    if (raw === null) return null;
    const n = Number(raw);
    return Number.isFinite(n) ? n : null;
  } catch {
    return null;
  }
}

function writeLastCheckedAt(t: number) {
  try {
    localStorage.setItem(LAST_CHECKED_KEY, String(t));
  } catch {
    // storage unavailable — UI will just show "Hasn't checked yet"
  }
}
```

- [ ] **Step 2: Add `lastCheckedAt` to the `UpdaterState` type**

Find `type UpdaterState = { … }` and add the field next to `dismissed`:

```ts
type UpdaterState = {
  status: UpdaterStatus;
  currentVersion: string;
  latestVersion: string | null;
  notes: string | null;
  progress: { downloaded: number; total: number | null } | null;
  error: string | null;
  autoCheck: boolean;
  dismissed: boolean;
  pending: Update | null;
  lastCheckedAt: number | null;

  check: (opts?: { manual?: boolean }) => Promise<void>;
  install: (when: "now" | "next-launch") => Promise<void>;
  dismiss: () => void;
  setAutoCheck: (on: boolean) => void;
};
```

- [ ] **Step 3: Initialize `lastCheckedAt` in the store factory**

Find the `create<UpdaterState>((set, get) => ({ … }))` block. In the initial state, after `pending: null`, add:

```ts
  pending: null,
  lastCheckedAt: readLastCheckedAt(),
```

- [ ] **Step 4: Update `check()` to record the timestamp on every terminal state**

Find the `async check(opts) { … }` action. Inside the `try` block, after the `if (update) { … } else { … }` branch (which sets status to `available` or `idle`), AND inside the `catch` block (after the existing `set({ status: "error", … })` lines), record the timestamp.

The cleanest way: write a tiny local helper at the top of `check()`:

```ts
async check(opts) {
  const manual = opts?.manual ?? false;
  set({
    status: "checking",
    error: null,
    dismissed: false,
    progress: null,
    latestVersion: null,
    notes: null,
    pending: null,
  });

  const stamp = () => {
    const now = Date.now();
    writeLastCheckedAt(now);
    set({ lastCheckedAt: now });
  };

  try {
    if (get().currentVersion === "0.0.0") {
      const v = await getVersion();
      set({ currentVersion: v });
    }
    const update = await check();
    if (update) {
      set({
        status: "available",
        latestVersion: update.version,
        notes: update.body ?? null,
        pending: update,
      });
    } else {
      set({
        status: "idle",
        latestVersion: null,
        notes: null,
        pending: null,
      });
    }
    stamp();
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    set({ status: "error", error: msg, dismissed: !manual });
    stamp();
  }
},
```

The key changes: add the `stamp` helper after the initial `set({ status: "checking", … })` reset, and call `stamp()` once at the end of the try block AND once at the end of the catch block. Don't call it before the work — we want the timestamp to mean "last successfully attempted check completed at".

- [ ] **Step 5: Verify typecheck + build**

```bash
npx tsc --noEmit
npm run build
```

Expected: both pass.

- [ ] **Step 6: Commit**

```bash
git add src/state/updater.ts
git commit -m "feat(about): record + persist updater lastCheckedAt timestamp"
```

---

## Task 4: Workspace selection flips view back to workspace

**Files:**
- Modify: `src/state/workspaces.ts`

Selecting a workspace from the sidebar should take the user out of the About pane and back into workspace context. Cleanest implementation: `useWorkspaces.select(id)` calls `useUi.setState({view: 'workspace'})` as a side effect. No circular import — `ui.ts` doesn't import from `workspaces.ts`.

- [ ] **Step 1: Add the import at the top of `src/state/workspaces.ts`**

Below the existing `import { create } from "zustand";` line, add:

```ts
import { useUi } from "./ui";
```

- [ ] **Step 2: Modify the `select` action to also reset the view**

Find the existing `select` action:

```ts
  select(id) {
    set({ selectedId: id });
  },
```

Replace with:

```ts
  select(id) {
    set({ selectedId: id });
    // Selecting a workspace exits the About pane back to workspace view —
    // matches the user's mental model: clicking a workspace navigates to
    // its settings, not "select workspace silently while staying in About".
    useUi.setState({ view: "workspace" });
  },
```

- [ ] **Step 3: Verify typecheck**

```bash
npx tsc --noEmit
```

Expected: passes.

- [ ] **Step 4: Commit**

```bash
git add src/state/workspaces.ts
git commit -m "feat(about): workspace selection exits About back to workspace view"
```

---

## Task 5: Create the `AboutPane` component

**Files:**
- Create: `src/components/AboutPane.tsx`

All five sections in one focused component (~200 lines). The pane mounts inside `<main>` when `useUi.view === 'about'` (wired in Task 6).

- [ ] **Step 1: Create `src/components/AboutPane.tsx`**

Create the file with exactly this content:

```tsx
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-opener";
import { Loader2, RefreshCw } from "lucide-react";
import { useEffect, useState } from "react";
import { cn } from "../lib/cn";
import { useUpdater } from "../state/updater";
import { Card } from "./ui";

type PlatformInfo = {
  os: string;
  arch: string;
  tauri_version: string;
};

const REPO_URL = "https://github.com/hydai/ccsettings";
const ISSUES_URL = "https://github.com/hydai/ccsettings/issues";

function osLabel(os: string): string {
  switch (os) {
    case "macos":
      return "macOS";
    case "linux":
      return "Linux";
    case "windows":
      return "Windows";
    default:
      return os;
  }
}

function relativeTime(ms: number, now: number = Date.now()): string {
  const diff = now - ms;
  const minutes = Math.round(diff / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? "" : "s"} ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days} day${days === 1 ? "" : "s"} ago`;
  // Older than a week — show absolute date.
  return new Date(ms).toLocaleDateString();
}

export function AboutPane() {
  const status = useUpdater((s) => s.status);
  const currentVersion = useUpdater((s) => s.currentVersion);
  const latestVersion = useUpdater((s) => s.latestVersion);
  const error = useUpdater((s) => s.error);
  const lastCheckedAt = useUpdater((s) => s.lastCheckedAt);
  const autoCheck = useUpdater((s) => s.autoCheck);
  const check = useUpdater((s) => s.check);
  const setAutoCheck = useUpdater((s) => s.setAutoCheck);

  const [platform, setPlatform] = useState<PlatformInfo | null>(null);
  const [platformError, setPlatformError] = useState(false);

  useEffect(() => {
    invoke<PlatformInfo>("get_platform_info")
      .then(setPlatform)
      .catch(() => setPlatformError(true));
  }, []);

  const isChecking = status === "checking";

  const updaterCopy = (() => {
    if (status === "checking") return "Checking for updates…";
    if (status === "available") return `Update available — v${latestVersion}`;
    if (status === "downloading") return "Downloading update…";
    if (status === "installing") return "Installing — ccsettings will restart…";
    if (status === "ready")
      return `v${latestVersion} ready to install on next launch`;
    if (status === "error")
      return `⚠ Last check failed — ${error ?? "unknown error"}`;
    // status === "idle"
    if (lastCheckedAt === null) return "Hasn't checked yet";
    return "✓ You're on the latest version";
  })();

  return (
    <div className="p-8 w-full max-w-6xl mx-auto space-y-8">
      {/* Section 1 — Identity */}
      <header className="flex items-baseline gap-3">
        <h2 className="font-display text-3xl font-medium text-ink leading-tight">
          ccsettings
        </h2>
        <span
          className={cn(
            "rounded-full px-3 py-0.5 font-sans text-xs font-medium",
            "bg-accent/15 text-accent",
          )}
        >
          v{currentVersion}
        </span>
      </header>
      <p className="font-body text-sm leading-[1.55] text-body -mt-6">
        A visual companion for Claude Code's layered settings — see what's
        effective for each project and edit any tier safely.
      </p>

      {/* Section 2 — Updater */}
      <Card variant="cream" className="p-6 space-y-4">
        <div className="flex items-baseline justify-between gap-4">
          <h3 className="font-sans text-lg font-semibold text-ink">Updates</h3>
          {lastCheckedAt !== null && (
            <span className="font-mono text-xs text-muted">
              Last checked {relativeTime(lastCheckedAt)}
            </span>
          )}
        </div>
        <p
          className={cn(
            "font-body text-sm",
            status === "error" ? "text-danger-soft" : "text-body",
          )}
        >
          {updaterCopy}
        </p>
        <div className="flex items-center gap-3 pt-2">
          <button
            type="button"
            onClick={() => check({ manual: true })}
            disabled={isChecking}
            className={cn(
              "inline-flex items-center gap-2 rounded-full px-4 py-2",
              "font-sans text-sm font-semibold",
              "bg-inverse text-on-inverse hover:bg-inverse/90 transition-colors",
              "disabled:opacity-40 disabled:cursor-not-allowed",
              "focus:outline-none focus-visible:shadow-focus-ink",
            )}
          >
            {isChecking ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <RefreshCw className="w-4 h-4" />
            )}
            {isChecking ? "Checking…" : "Check for updates"}
          </button>
        </div>
        <label className="flex items-center gap-2 pt-2 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={autoCheck}
            onChange={(e) => setAutoCheck(e.target.checked)}
            className="h-4 w-4 rounded border-hairline accent-accent"
          />
          <span className="font-body text-sm text-body">
            Automatically check for updates on startup
          </span>
        </label>
      </Card>

      {/* Section 3 — Links */}
      <section className="space-y-2">
        <h3 className="font-sans text-sm font-semibold text-muted uppercase tracking-wide">
          Links
        </h3>
        <div className="flex flex-wrap gap-2">
          <LinkButton
            label="Repository"
            href={REPO_URL}
          />
          <LinkButton
            label="Issues"
            href={ISSUES_URL}
          />
          <LinkButton
            label="This release"
            href={`${REPO_URL}/releases/tag/v${currentVersion}`}
          />
        </div>
      </section>

      {/* Section 4 — Platform */}
      <section>
        <h3 className="font-sans text-sm font-semibold text-muted uppercase tracking-wide mb-1">
          Platform
        </h3>
        <p className="font-mono text-xs text-muted">
          {platformError
            ? "Platform info unavailable"
            : platform
              ? `${osLabel(platform.os)} ${platform.arch} · Tauri ${platform.tauri_version}`
              : "Loading…"}
        </p>
      </section>

      {/* Section 5 — License + credits */}
      <footer className="pt-6 border-t border-hairline">
        <p className="font-body text-xs text-muted">
          Apache-2.0 · Built with Tauri, React, and Zustand.
        </p>
      </footer>
    </div>
  );
}

function LinkButton({ label, href }: { label: string; href: string }) {
  return (
    <button
      type="button"
      onClick={() => {
        open(href).catch(() => {
          // Silent failure — no toast/banner system to surface this in,
          // and external-link failures are usually a user-environment issue.
        });
      }}
      className={cn(
        "rounded-full px-4 py-1.5 font-sans text-sm font-medium",
        "bg-card text-ink hover:bg-card/80 transition-colors",
        "border border-hairline",
        "focus:outline-none focus-visible:shadow-focus-ink",
      )}
    >
      {label}
    </button>
  );
}
```

- [ ] **Step 2: Verify typecheck + build**

```bash
npx tsc --noEmit
npm run build
```

Expected: both pass. The `lucide-react` package is already installed (Task 3 confirmed); `Loader2` and `RefreshCw` are existing exports.

- [ ] **Step 3: Commit**

```bash
git add src/components/AboutPane.tsx
git commit -m "feat(about): create AboutPane with identity, updater, links, platform, license sections"
```

---

## Task 6: Wire `AboutPane` in `AppShell`

**Files:**
- Modify: `src/components/AppShell.tsx`

When `useUi.view === 'about'`, the main element shows `<AboutPane />` regardless of workspace selection. Otherwise the existing `WorkspacePane` / `EmptyState` flow.

- [ ] **Step 1: Add the imports**

In `src/components/AppShell.tsx`, near the existing component imports, add:

```tsx
import { useUi } from "../state/ui";
import { AboutPane } from "./AboutPane";
```

(Place them alphabetically with the other `./` imports.)

- [ ] **Step 2: Read `view` and branch in the AppShell return**

The existing `AppShell` function looks like:

```tsx
export function AppShell() {
  const selected = useWorkspaces(
    (s) => s.workspaces.find((w) => w.id === s.selectedId) ?? null,
  );

  return (
    <div className="flex h-screen bg-canvas">
      <Sidebar />
      <main className="flex-1 min-w-0 overflow-auto">
        {selected ? <WorkspacePane workspace={selected} /> : <EmptyState />}
      </main>
    </div>
  );
}
```

Replace with:

```tsx
export function AppShell() {
  const selected = useWorkspaces(
    (s) => s.workspaces.find((w) => w.id === s.selectedId) ?? null,
  );
  const view = useUi((s) => s.view);

  return (
    <div className="flex h-screen bg-canvas">
      <Sidebar />
      <main className="flex-1 min-w-0 overflow-auto">
        {view === "about" ? (
          <AboutPane />
        ) : selected ? (
          <WorkspacePane workspace={selected} />
        ) : (
          <EmptyState />
        )}
      </main>
    </div>
  );
}
```

- [ ] **Step 3: Verify typecheck + build**

```bash
npx tsc --noEmit
npm run build
```

Expected: passes.

- [ ] **Step 4: Commit**

```bash
git add src/components/AppShell.tsx
git commit -m "feat(about): route to AboutPane when useUi.view === 'about'"
```

---

## Task 7: Add About button to Sidebar footer

**Files:**
- Modify: `src/components/Sidebar.tsx`

The button lives below `<UpdatePill />` in the existing footer div. Click sets view to 'about'. Visual style: ghost button matching the other footer buttons.

- [ ] **Step 1: Add the import for `useUi`**

In `src/components/Sidebar.tsx`, the existing imports include `useUpdater` from earlier work. Add:

```tsx
import { useUi } from "../state/ui";
```

(Place near other `../state` imports.)

- [ ] **Step 2: Add an Info icon import from lucide-react**

Find the existing `import { Plus, Search } from "lucide-react";` line. Change to:

```tsx
import { Info, Plus, Search } from "lucide-react";
```

- [ ] **Step 3: Add the About button after UpdatePill in the footer**

Find the footer div in the `Sidebar` function:

```tsx
      <div className="p-3 border-t border-hairline space-y-1.5">
        <Button …>Add workspace</Button>
        <Button …>Discover…</Button>
        <ThemeToggle />
        <UpdatePill />
      </div>
```

Add the About button after `<UpdatePill />`:

```tsx
      <div className="p-3 border-t border-hairline space-y-1.5">
        <Button …>Add workspace</Button>
        <Button …>Discover…</Button>
        <ThemeToggle />
        <UpdatePill />
        <Button
          variant="ghost"
          size="sm"
          onClick={() => useUi.setState({ view: "about" })}
          className="w-full justify-start"
        >
          <Info className="w-4 h-4" />
          About
        </Button>
      </div>
```

- [ ] **Step 4: Verify typecheck + build**

```bash
npx tsc --noEmit
npm run build
```

Expected: passes.

- [ ] **Step 5: Commit**

```bash
git add src/components/Sidebar.tsx
git commit -m "feat(about): add About button to Sidebar footer"
```

---

## Task 8: Manual smoke test (no commit)

**Files:** none.

Confirm the wiring works end-to-end before cutting a release.

- [ ] **Step 1: Launch dev**

```bash
cd /Users/hydai/workspace/vibe/ccsettings
npm run tauri dev
```

- [ ] **Step 2: Click "About" in the sidebar footer**

Confirm:
- AppShell main pane swaps to AboutPane
- Identity shows `ccsettings` + `v0.1.3` (or whatever current version is)
- Updater section shows status copy ("✓ You're on the latest version" if check has run, or "Hasn't checked yet")
- Three Link buttons visible (Repository / Issues / This release)
- Platform line shows e.g. `macOS aarch64 · Tauri 2.10.3`
- License footer at the bottom

- [ ] **Step 3: Click "Check for updates"**

Confirm:
- Button shows "Checking…" with a spinner
- After response: copy updates, "Last checked just now" appears
- Button returns to "Check for updates"

- [ ] **Step 4: Toggle auto-check off, then on**

Confirm:
- Checkbox state changes
- Reload the dev app (`Cmd+R` in the webview, or quit + restart)
- After reload, checkbox state matches what you left it (localStorage persistence)

- [ ] **Step 5: Click a workspace in the sidebar list**

Confirm:
- View flips back to WorkspacePane
- Click About again → AboutPane returns

- [ ] **Step 6: Quit dev (Ctrl+C in terminal). No commit — verification only.**

---

## Task 9: Cut v0.1.4 release

**Files:**
- Modify: `package.json`, `src-tauri/Cargo.toml`, `src-tauri/tauri.conf.json`, `CHANGELOG.md`

- [ ] **Step 1: Bump manifests to `0.1.4`**

Edit three files, replacing `0.1.3` with `0.1.4` in the `version` field only:
- `package.json`
- `src-tauri/Cargo.toml`
- `src-tauri/tauri.conf.json`

Then regenerate the lockfile:

```bash
cd /Users/hydai/workspace/vibe/ccsettings/src-tauri && cargo check --release && cd ..
```

Expected: `Cargo.lock` updates the `ccsettings` entry to `0.1.4`.

- [ ] **Step 2: Add a CHANGELOG section**

Insert above the `## v0.1.3 — 2026-04-18` section:

```markdown
## v0.1.4 — 2026-04-18

New About pane accessible from the sidebar footer:

- **Identity**: app name, current version, one-line description.
- **Updates**: dedicated controls — "Check for updates" button (manual
  trigger), "Automatically check on startup" toggle (mirrors and
  persists the existing autoCheck preference), and a "Last checked X
  ago" timestamp.
- **Links**: Repository, Issues, and This release (linked to the
  current version's GitHub release page).
- **Platform**: OS / arch / Tauri runtime version line.
- **License + credits**: Apache-2.0 · Built with Tauri, React, Zustand.

Implementation note: a new `useUi.view` field routes the main pane
between workspace and about modes. Selecting a workspace from the
sidebar exits About automatically.
```

Reset the `## Unreleased` placeholder to `(Nothing yet — changes after v0.1.4 land here.)`.

- [ ] **Step 3: Verify locally**

```bash
cd src-tauri
cargo fmt --all -- --check
cargo clippy --release --all-targets -- -D warnings
cargo test --release
cd ..
npx tsc --noEmit
npm run build
lineguard package.json src-tauri/Cargo.toml src-tauri/tauri.conf.json CHANGELOG.md src/components/AboutPane.tsx src/state/ui.ts src/state/updater.ts src/state/workspaces.ts src/components/Sidebar.tsx src/components/AppShell.tsx src-tauri/src/commands.rs src-tauri/src/lib.rs
```

Expected: all pass.

- [ ] **Step 4: Commit + push**

```bash
git add package.json src-tauri/Cargo.toml src-tauri/Cargo.lock src-tauri/tauri.conf.json CHANGELOG.md
git commit -m "chore(release): prep v0.1.4"
git push origin main
```

- [ ] **Step 5: Wait for CI**

```bash
sleep 8
ci_id=$(gh run list --workflow=ci.yml --limit 1 --json databaseId --jq '.[0].databaseId')
until st=$(gh run view "$ci_id" --json status,conclusion --jq '"\(.status) \(.conclusion)"') && [[ "$st" == *completed* ]]; do
  echo "[$(date +%H:%M:%S)] $st"
  sleep 40
done
echo "FINAL $st"
```

Expected: `FINAL completed success`.

- [ ] **Step 6: Tag and push**

```bash
HEAD_SHA=$(git rev-parse HEAD)
git tag v0.1.4 "$HEAD_SHA" -m "ccsettings v0.1.4 — About pane with manual updater controls"
git push origin v0.1.4
```

- [ ] **Step 7: Watch the release workflow**

```bash
sleep 8
rel_id=$(gh run list --workflow=release.yml --limit 1 --json databaseId --jq '.[0].databaseId')
until rst=$(gh run view "$rel_id" --json status,conclusion --jq '"\(.status) \(.conclusion)"') && [[ "$rst" == *completed* ]]; do
  echo "[$(date +%H:%M:%S)] $rst"
  sleep 75
done
echo "FINAL $rst"
```

Expected: `FINAL completed success`. If Windows fails with the "no asset" race we hit on v0.1.3, re-run the failed Windows job (`gh run rerun $rel_id --failed`) and watch again — the merge-into-existing-latest.json logic recovers.

- [ ] **Step 8: Verify the draft has all 13 assets including `latest.json`**

```bash
gh release view v0.1.4 --json isDraft,isPrerelease,assets \
  --jq '{isDraft, isPrerelease, assetCount: (.assets | length), hasManifest: (.assets | map(.name) | contains(["latest.json"]))}'
```

Expected: `{"isDraft":true,"isPrerelease":false,"assetCount":13,"hasManifest":true}`.

- [ ] **Step 9: User publishes the draft**

Open https://github.com/hydai/ccsettings/releases/tag/v0.1.4 in a browser. Click **Publish release** (do not check pre-release). After ~30 seconds for GitHub's `/releases/latest/` redirect to settle, the v0.1.3 instance should auto-update to v0.1.4 — this is the live test that the About pane ships correctly through the existing updater pipeline.

---

## Self-review checklist (already run by author; included for posterity)

**Spec coverage:**
- View routing via `useUi.view`: Tasks 2, 6
- `lastCheckedAt` persisted: Task 3
- Workspace-select side-effect: Task 4
- Sidebar footer "About" entry: Task 7
- AboutPane: Identity (Task 5 §1), Updater (Task 5 §2), Links (Task 5 §3), Platform (Task 5 §4 + Task 1 backend), License (Task 5 §5)
- Updater status copy variations including `checking`: Task 5 `updaterCopy` IIFE
- "Last checked X ago" relative time: Task 5 `relativeTime`
- Backend `get_platform_info`: Task 1

**Placeholder scan:** No TBDs/TODOs/"add appropriate" patterns. The single literal that requires user action (publishing the draft) is explicitly flagged in Task 9 Step 9.

**Type consistency:** `View`, `Category`, `UiState`, `UpdaterState`, `PlatformInfo`, `useUi`, `useUpdater`, `useWorkspaces`, `setView` are all used consistently across the tasks. The `lastCheckedAt: number | null` shape matches between Task 3's store definition and Task 5's `useUpdater` reads.

---

## Execution handoff (choose one)

**Option 1: Subagent-Driven (recommended)** — fresh subagent per task with two-stage review. Cleaner for review; each task is independently committable.

**Option 2: Inline Execution** — execute tasks 1–9 sequentially in this session with phase checkpoints. Faster for the mechanical wiring (Tasks 1–7); the smoke test (Task 8) and release cut (Task 9) need your hands either way.
