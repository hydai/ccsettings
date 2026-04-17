# Updater Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire `tauri-plugin-updater` end-to-end so ccsettings checks for, downloads, verifies, and installs new versions from GitHub Releases without the user leaving the app.

**Architecture:** Tauri plugin registered on the Rust side; zustand store drives a state machine on the frontend; two UI surfaces (sidebar footer pill + top conflict-style banner) reflect state; `release.yml` signs bundles with Ed25519 and publishes `latest.json` as a release asset; frontend points at `https://github.com/hydai/ccsettings/releases/latest/download/latest.json` so GitHub's `/releases/latest/` redirect auto-filters prereleases.

**Tech Stack:** Rust + `tauri-plugin-updater` v2, TypeScript + React + zustand, `@tauri-apps/plugin-updater` + `@tauri-apps/api/app`, Tailwind (existing design tokens only), GitHub Actions + `tauri-apps/tauri-action@v0` + `gh` CLI.

**Design spec:** `docs/superpowers/specs/2026-04-17-updater-design.md` (read before starting).

**Note on testing:** No frontend test framework exists in this repo and the spec explicitly doesn't require adding one. Rust-side verification uses `cargo check/clippy/test`; frontend verification uses `tsc --noEmit` + manual smoke in `npm run tauri dev`; CI changes verify via a real tag cut. Tasks use "make change → verify compiles/typechecks → smoke → commit" rather than classic TDD.

---

## Prerequisite — Phase 0: User-side signing setup

### Task 0: User generates signing keypair + uploads GitHub secrets

Required BEFORE any implementation task. The engineer cannot run these commands for the user (they involve the user's local filesystem and GitHub repo secrets).

**User runs, from any directory:**

```bash
# Generate an Ed25519 keypair. Prompts for a passphrase.
mkdir -p ~/.tauri
npm --prefix /Users/hydai/workspace/vibe/ccsettings exec tauri signer generate -- -w ~/.tauri/ccsettings.key
```

The command writes two files:
- `~/.tauri/ccsettings.key` — private key (one-line, opaque)
- `~/.tauri/ccsettings.key.pub` — public key (one-line, opaque, starts with `dW50cnVzdGVk…` or similar)

**User uploads secrets to the `hydai/ccsettings` repo:**

```bash
gh secret set TAURI_SIGNING_PRIVATE_KEY < ~/.tauri/ccsettings.key
gh secret set TAURI_SIGNING_PRIVATE_KEY_PASSWORD
# ^ prompts interactively for the passphrase they chose above
```

Verify both secrets are set:

```bash
gh secret list
# Expected output includes:
#   TAURI_SIGNING_PRIVATE_KEY            Updated 2026-04-17
#   TAURI_SIGNING_PRIVATE_KEY_PASSWORD   Updated 2026-04-17
```

**User shares the PUBLIC key contents with the engineer:**

```bash
cat ~/.tauri/ccsettings.key.pub
```

Copy-paste the one-line string output. The engineer embeds it in `tauri.conf.json` during Task 6.

- [ ] **Step 1 (user):** Run `tauri signer generate` and confirm files exist at `~/.tauri/ccsettings.key` and `~/.tauri/ccsettings.key.pub`
- [ ] **Step 2 (user):** Run `gh secret set` for both `TAURI_SIGNING_PRIVATE_KEY` and `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`
- [ ] **Step 3 (user):** Run `gh secret list` and confirm both names appear
- [ ] **Step 4 (user):** Paste the contents of `~/.tauri/ccsettings.key.pub` into the conversation so the engineer has it for Task 6

**Gate:** No downstream tasks can start until steps 1–4 complete. The engineer should block and prompt the user explicitly if they try to proceed without a public key.

---

## Phase 1: Rust plugin wiring

### Task 1: Add `tauri-plugin-updater` to Cargo.toml

**Files:**
- Modify: `src-tauri/Cargo.toml`

- [ ] **Step 1: Add the dependency**

Open `src-tauri/Cargo.toml` and insert this line in the `[dependencies]` table, keeping the existing tauri plugin deps together:

```toml
tauri-plugin-updater = "2"
```

- [ ] **Step 2: Verify it resolves**

```bash
cd src-tauri
cargo check --release
```

Expected: compiles cleanly (may take a few minutes on first resolve as it downloads the plugin crate). `Cargo.lock` gets updated.

- [ ] **Step 3: Commit**

```bash
cd /Users/hydai/workspace/vibe/ccsettings
git add src-tauri/Cargo.toml src-tauri/Cargo.lock
git commit -m "feat(updater): add tauri-plugin-updater Rust dependency"
```

---

### Task 2: Register the updater plugin in the Tauri builder

**Files:**
- Modify: `src-tauri/src/lib.rs` (around line 20, the `tauri::Builder::default()` chain)

- [ ] **Step 1: Add the plugin registration**

In `src-tauri/src/lib.rs`, find the existing `tauri::Builder::default()` chain. It currently looks like:

```rust
tauri::Builder::default()
    .plugin(tauri_plugin_opener::init())
    .plugin(tauri_plugin_dialog::init())
    .manage(state)
    .invoke_handler(...)
```

Insert the updater plugin registration between `tauri_plugin_dialog::init()` and `.manage(state)`:

```rust
tauri::Builder::default()
    .plugin(tauri_plugin_opener::init())
    .plugin(tauri_plugin_dialog::init())
    .plugin(tauri_plugin_updater::Builder::new().build())
    .manage(state)
    .invoke_handler(...)
```

- [ ] **Step 2: Verify compilation**

```bash
cd src-tauri
cargo check --release
cargo clippy --release --all-targets -- -D warnings
```

Expected: both pass, zero warnings.

- [ ] **Step 3: Run Rust tests**

```bash
cargo test --release
```

Expected: 67 unit tests + 10 integration tests all pass (unchanged from baseline).

- [ ] **Step 4: Commit**

```bash
cd /Users/hydai/workspace/vibe/ccsettings
git add src-tauri/src/lib.rs
git commit -m "feat(updater): register tauri-plugin-updater in builder chain"
```

---

## Phase 2: Frontend plugin + state + UI

### Task 3: Install `@tauri-apps/plugin-updater`

**Files:**
- Modify: `package.json`, `package-lock.json`

- [ ] **Step 1: Install**

```bash
cd /Users/hydai/workspace/vibe/ccsettings
npm install @tauri-apps/plugin-updater
```

Expected: `package.json` gains a `@tauri-apps/plugin-updater: "^2"` entry under `dependencies`; `package-lock.json` updates.

- [ ] **Step 2: Verify TypeScript resolution**

```bash
npx tsc --noEmit
```

Expected: passes (new package's types are discovered).

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "feat(updater): add @tauri-apps/plugin-updater JS dependency"
```

---

### Task 4: Create the updater zustand store

**Files:**
- Create: `src/state/updater.ts`

The store owns the state machine and exposes four actions (`check`, `install`, `dismiss`, `setAutoCheck`). Persistence pattern mirrors `src/state/theme.ts`: localStorage for the `autoCheck` preference and a separate "install on next launch" flag.

- [ ] **Step 1: Write the store**

Create `src/state/updater.ts` with exactly this content:

```ts
import { getVersion } from "@tauri-apps/api/app";
import { check, type Update } from "@tauri-apps/plugin-updater";
import { create } from "zustand";

export type UpdaterStatus =
  | "idle"
  | "checking"
  | "available"
  | "downloading"
  | "ready"
  | "installing"
  | "error";

const AUTO_CHECK_KEY = "ccsettings:updater:autoCheck";
const PENDING_INSTALL_KEY = "ccsettings:updater:installOnNextLaunch";

function readAutoCheck(): boolean {
  try {
    const raw = localStorage.getItem(AUTO_CHECK_KEY);
    if (raw === null) return true; // default-on for new installs
    return raw === "true";
  } catch {
    return true;
  }
}

function writeAutoCheck(v: boolean) {
  try {
    localStorage.setItem(AUTO_CHECK_KEY, v ? "true" : "false");
  } catch {
    // private mode / quota exceeded — silently skip
  }
}

export function hasPendingInstall(): boolean {
  try {
    return localStorage.getItem(PENDING_INSTALL_KEY) === "true";
  } catch {
    return false;
  }
}

export function clearPendingInstall() {
  try {
    localStorage.removeItem(PENDING_INSTALL_KEY);
  } catch {
    // ignore
  }
}

function setPendingInstall() {
  try {
    localStorage.setItem(PENDING_INSTALL_KEY, "true");
  } catch {
    // ignore — user will just see the update on next manual check
  }
}

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

  check: (opts?: { manual?: boolean }) => Promise<void>;
  install: (when: "now" | "next-launch") => Promise<void>;
  dismiss: () => void;
  setAutoCheck: (on: boolean) => void;
};

export const useUpdater = create<UpdaterState>((set, get) => ({
  status: "idle",
  currentVersion: "0.0.0", // replaced on first check()
  latestVersion: null,
  notes: null,
  progress: null,
  error: null,
  autoCheck: readAutoCheck(),
  dismissed: false,
  pending: null,

  async check(opts) {
    const manual = opts?.manual ?? false;
    set({ status: "checking", error: null, dismissed: false });

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
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (manual) {
        set({ status: "error", error: msg });
      } else {
        // Silent failure on automatic checks (network flaky, offline, etc).
        set({ status: "idle", error: null });
      }
    }
  },

  async install(when) {
    const update = get().pending;
    if (!update) return;

    if (when === "next-launch") {
      try {
        set({ status: "downloading", progress: { downloaded: 0, total: null } });
        await update.download((event) => {
          if (event.event === "Started") {
            set({
              progress: {
                downloaded: 0,
                total: event.data.contentLength ?? null,
              },
            });
          } else if (event.event === "Progress") {
            const p = get().progress;
            if (p) {
              set({
                progress: {
                  downloaded: p.downloaded + event.data.chunkLength,
                  total: p.total,
                },
              });
            }
          }
        });
        setPendingInstall();
        set({ status: "ready" });
      } catch (e) {
        set({ status: "error", error: e instanceof Error ? e.message : String(e) });
      }
      return;
    }

    // when === "now"
    try {
      set({ status: "downloading", progress: { downloaded: 0, total: null } });
      await update.downloadAndInstall((event) => {
        if (event.event === "Started") {
          set({
            progress: {
              downloaded: 0,
              total: event.data.contentLength ?? null,
            },
          });
        } else if (event.event === "Progress") {
          const p = get().progress;
          if (p) {
            set({
              progress: {
                downloaded: p.downloaded + event.data.chunkLength,
                total: p.total,
              },
            });
          }
        } else if (event.event === "Finished") {
          set({ status: "installing", progress: null });
        }
      });
      // Execution typically does not return here; the plugin triggers a
      // relaunch. If it does return (e.g., macOS cold install), fall through.
    } catch (e) {
      set({ status: "error", error: e instanceof Error ? e.message : String(e) });
    }
  },

  dismiss() {
    set({ dismissed: true });
  },

  setAutoCheck(on) {
    writeAutoCheck(on);
    set({ autoCheck: on });
  },
}));
```

- [ ] **Step 2: Verify compilation**

```bash
cd /Users/hydai/workspace/vibe/ccsettings
npx tsc --noEmit
```

Expected: passes.

- [ ] **Step 3: Commit**

```bash
git add src/state/updater.ts
git commit -m "feat(updater): zustand store with state machine and persistence"
```

---

### Task 5: Create the `UpdateBanner` component

**Files:**
- Create: `src/components/UpdateBanner.tsx`

Cloned shell from `src/components/SaveControls.tsx:82-110` (the non-conflict variant: `h-16 rounded-soft-md`, `bg-inverse text-on-inverse`). Hidden when status is `idle` or `checking`, or when the user has dismissed this cycle.

- [ ] **Step 1: Write the component**

Create `src/components/UpdateBanner.tsx` with exactly this content:

```tsx
import { X } from "lucide-react";
import { cn } from "../lib/cn";
import { useUpdater } from "../state/updater";

export function UpdateBanner() {
  const status = useUpdater((s) => s.status);
  const latestVersion = useUpdater((s) => s.latestVersion);
  const progress = useUpdater((s) => s.progress);
  const error = useUpdater((s) => s.error);
  const dismissed = useUpdater((s) => s.dismissed);
  const install = useUpdater((s) => s.install);
  const dismiss = useUpdater((s) => s.dismiss);
  const check = useUpdater((s) => s.check);

  if (status === "idle" || status === "checking") return null;
  if (dismissed && status !== "error") return null;

  const isError = status === "error";
  const isReady = status === "ready";
  const isInstalling = status === "installing";
  const isDownloading = status === "downloading";

  const percent =
    progress && progress.total && progress.total > 0
      ? Math.round((progress.downloaded / progress.total) * 100)
      : null;

  const leftLabel = (() => {
    if (isError) return `Update check failed — ${error ?? "unknown error"}`;
    if (isReady) return `v${latestVersion} will install on next launch`;
    if (isInstalling) return "Installing — ccsettings will restart…";
    if (isDownloading)
      return percent !== null
        ? `Downloading v${latestVersion} — ${percent}%`
        : `Downloading v${latestVersion}…`;
    return `Update available — v${latestVersion}`;
  })();

  return (
    <div
      className={cn(
        "h-16 rounded-soft-md flex items-center justify-between gap-4",
        "pl-6 pr-5",
        isError ? "bg-conflict text-on-inverse" : "bg-inverse text-on-inverse",
      )}
      role="status"
      aria-live="polite"
    >
      <span className="font-sans text-sm font-semibold truncate">
        {leftLabel}
      </span>
      <div className="flex items-center gap-2 flex-shrink-0">
        {isError && (
          <button
            type="button"
            onClick={() => check({ manual: true })}
            className={cn(
              "rounded-full font-sans text-xs font-medium px-3.5 py-1.5",
              "bg-on-inverse/15 text-on-inverse hover:bg-on-inverse/25 transition-colors",
              "focus:outline-none focus-visible:shadow-focus-ink",
            )}
          >
            Retry
          </button>
        )}

        {status === "available" && (
          <>
            <button
              type="button"
              onClick={() => install("next-launch")}
              className={cn(
                "rounded-full font-sans text-xs font-medium px-3.5 py-1.5",
                "bg-on-inverse/15 text-on-inverse hover:bg-on-inverse/25 transition-colors",
                "focus:outline-none focus-visible:shadow-focus-ink",
              )}
            >
              Install on next launch
            </button>
            <button
              type="button"
              onClick={() => install("now")}
              className={cn(
                "rounded-full font-sans text-xs font-semibold px-4 py-1.5",
                "bg-on-inverse text-inverse hover:bg-on-inverse/90 transition-colors",
                "focus:outline-none focus-visible:shadow-focus-ink",
              )}
            >
              Install &amp; restart now
            </button>
          </>
        )}

        <button
          type="button"
          onClick={dismiss}
          aria-label="Dismiss"
          className={cn(
            "rounded-full p-1.5",
            "text-on-inverse/70 hover:text-on-inverse hover:bg-on-inverse/10 transition-colors",
            "focus:outline-none focus-visible:shadow-focus-ink",
          )}
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify compilation**

```bash
npx tsc --noEmit
```

Expected: passes.

- [ ] **Step 3: Commit**

```bash
git add src/components/UpdateBanner.tsx
git commit -m "feat(updater): top banner UI with install/dismiss/retry actions"
```

---

### Task 6: Mount the banner in `AppShell`

**Files:**
- Modify: `src/components/AppShell.tsx`

The banner sits above the `CategoryPicker` inside `WorkspacePane` — same visual level as page header. When no workspace is selected (EmptyState), the banner mounts inside the main element above the empty-state card so first-launch users still see update prompts.

- [ ] **Step 1: Add the import**

At the top of `src/components/AppShell.tsx`, add:

```tsx
import { UpdateBanner } from "./UpdateBanner";
```

(Insert alphabetically-ish near the other `./` imports — right above or below `import { Sidebar } from "./Sidebar";`.)

- [ ] **Step 2: Mount inside `WorkspacePane`**

In the existing `WorkspacePane` function, wrap the `<CategoryPicker />` so the banner appears above it:

```tsx
  return (
    <div className="p-8 w-full max-w-6xl mx-auto space-y-6">
      <header>
        <h2 className="font-sans text-2xl font-semibold text-ink leading-tight">
          {workspace.name}
        </h2>
        <p className="font-mono text-xs text-muted mt-1.5">{workspace.path}</p>
      </header>

      <UpdateBanner />

      <CategoryPicker />
```

- [ ] **Step 3: Mount inside `EmptyState`**

Change the `EmptyState` function to also render the banner. Replace its outer `<div>` with a fragment + explicit layout so the banner sits above the card:

```tsx
function EmptyState() {
  return (
    <div className="h-full p-8 flex flex-col gap-6 items-center justify-center">
      <div className="w-full max-w-xl">
        <UpdateBanner />
      </div>
      <Card variant="soft" className="max-w-xl p-10 space-y-6">
        {/* existing card content unchanged */}
```

Keep all child content inside the `<Card>` identical.

- [ ] **Step 4: Verify compilation**

```bash
npx tsc --noEmit
```

Expected: passes.

- [ ] **Step 5: Commit**

```bash
git add src/components/AppShell.tsx
git commit -m "feat(updater): mount UpdateBanner above workspace and empty-state panes"
```

---

### Task 7: Add the sidebar footer version pill

**Files:**
- Modify: `src/components/Sidebar.tsx` (lines 101-122)

The pill lives inside the existing footer div (`<div className="p-3 border-t border-hairline space-y-1.5">`) **after** `<ThemeToggle />`. Visible only when an update is available, ready, or errored. Clicking scrolls the top banner into view.

- [ ] **Step 1: Add the subcomponent at the bottom of Sidebar.tsx**

Append this to the bottom of `src/components/Sidebar.tsx`, after the existing `Sidebar` function:

```tsx
function UpdatePill() {
  const status = useUpdater((s) => s.status);
  const latestVersion = useUpdater((s) => s.latestVersion);
  const check = useUpdater((s) => s.check);

  const visible =
    status === "available" ||
    status === "ready" ||
    status === "downloading" ||
    status === "error";

  if (!visible) return null;

  const label =
    status === "error"
      ? "⚠ Retry"
      : status === "ready"
      ? `v${latestVersion} pending`
      : status === "downloading"
      ? "Downloading…"
      : `v${latestVersion} ↑`;

  const tone =
    status === "error"
      ? "bg-danger-soft/10 text-danger-soft hover:bg-danger-soft/20"
      : "bg-accent/15 text-accent hover:bg-accent/25";

  return (
    <button
      type="button"
      onClick={() =>
        status === "error"
          ? check({ manual: true })
          : document.getElementById("root")?.scrollTo({ top: 0, behavior: "smooth" })
      }
      className={cn(
        "w-full rounded-full px-3 py-1.5 font-sans text-xs font-medium",
        "transition-colors text-left",
        "focus:outline-none focus-visible:shadow-focus-ink",
        tone,
      )}
      aria-live="polite"
    >
      {label}
    </button>
  );
}
```

- [ ] **Step 2: Import `useUpdater` at the top of the file**

Add to the existing import block:

```tsx
import { useUpdater } from "../state/updater";
```

- [ ] **Step 3: Render the pill below `<ThemeToggle />` in the footer**

Find the footer div at line ~101:

```tsx
      <div className="p-3 border-t border-hairline space-y-1.5">
        <Button …>…</Button>
        <Button …>…</Button>
        <ThemeToggle />
      </div>
```

Add the pill after `<ThemeToggle />`:

```tsx
      <div className="p-3 border-t border-hairline space-y-1.5">
        <Button …>…</Button>
        <Button …>…</Button>
        <ThemeToggle />
        <UpdatePill />
      </div>
```

- [ ] **Step 4: Verify compilation**

```bash
npx tsc --noEmit
```

Expected: passes.

- [ ] **Step 5: Commit**

```bash
git add src/components/Sidebar.tsx
git commit -m "feat(updater): sidebar footer version pill reflecting updater status"
```

---

### Task 8: Wire the startup auto-check and pending-install consumption

**Files:**
- Modify: `src/main.tsx`

Two pieces of startup logic:
1. If `hasPendingInstall()` returns true, re-check + install immediately before React mounts (user picked "install on next launch" in a prior session).
2. Otherwise, mount React normally, and 3 seconds after mount, trigger an auto-check if `autoCheck` is on.

- [ ] **Step 1: Replace `src/main.tsx` contents**

Replace the entire file with:

```tsx
import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { check } from "@tauri-apps/plugin-updater";
import {
  clearPendingInstall,
  hasPendingInstall,
  useUpdater,
} from "./state/updater";
import "./styles.css";

async function applyPendingInstall() {
  clearPendingInstall();
  try {
    const update = await check();
    if (update) {
      await update.downloadAndInstall();
      // downloadAndInstall triggers a relaunch on success; execution does
      // not typically reach the next line.
    }
  } catch {
    // Silent failure — continue to normal startup. User can retry via the
    // sidebar pill / banner.
  }
}

async function bootstrap() {
  if (hasPendingInstall()) {
    await applyPendingInstall();
  }

  ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  );

  // Kick off an auto-check ~3s after mount when autoCheck is on.
  setTimeout(() => {
    if (useUpdater.getState().autoCheck) {
      useUpdater.getState().check();
    }
  }, 3000);
}

bootstrap();
```

- [ ] **Step 2: Verify compilation**

```bash
npx tsc --noEmit
```

Expected: passes.

- [ ] **Step 3: Commit**

```bash
git add src/main.tsx
git commit -m "feat(updater): startup auto-check and pending-install consumption"
```

---

### Task 9: Embed the production public key in tauri.conf.json

**Files:**
- Modify: `src-tauri/tauri.conf.json`

Replace `<PUBLIC_KEY>` with the one-line string from `~/.tauri/ccsettings.key.pub` that the user shared in Task 0, Step 4.

- [ ] **Step 1: Read the current file to see existing top-level keys**

Confirm `src-tauri/tauri.conf.json` has no existing `"plugins"` key (the repo hasn't added one yet). If `"plugins"` already exists, merge into it instead of adding a new top-level key.

```bash
grep -n '"plugins"' src-tauri/tauri.conf.json || echo "no plugins key yet"
```

- [ ] **Step 2: Add the `plugins.updater` block**

Insert this as a top-level key in the JSON (placement next to `"app"` is conventional):

```json
  "plugins": {
    "updater": {
      "endpoints": [
        "https://github.com/hydai/ccsettings/releases/latest/download/latest.json"
      ],
      "pubkey": "<PASTE_PUBLIC_KEY_FROM_USER_HERE>"
    }
  }
```

Make sure the resulting JSON is still valid (the `"plugins"` key needs a preceding comma after whatever key it follows).

- [ ] **Step 3: Validate JSON**

```bash
python3 -m json.tool src-tauri/tauri.conf.json > /dev/null && echo OK
```

Expected: prints `OK`.

- [ ] **Step 4: Verify the dev build still compiles + launches**

```bash
cd /Users/hydai/workspace/vibe/ccsettings
npm run tauri dev
```

Expected: app launches, the sidebar + workspace panes render, no console errors related to updater config. Quit with `Ctrl+C`.

- [ ] **Step 5: Commit**

```bash
git add src-tauri/tauri.conf.json
git commit -m "feat(updater): embed production public key and endpoint URL"
```

---

### Task 10: Local smoke test (manual, no new code)

**Files:** none.

Confirm the UI plumbing works end-to-end in dev mode against real network calls (the check will return "no update" since no `latest.json` has been published yet, but the UI transitions and sidebar pill should still behave correctly).

- [ ] **Step 1: Launch dev mode**

```bash
cd /Users/hydai/workspace/vibe/ccsettings
npm run tauri dev
```

- [ ] **Step 2: Observe startup**

Open the devtools console (right-click → Inspect). After ~3 seconds, confirm:
- A network request fires to `https://github.com/hydai/ccsettings/releases/latest/download/latest.json` (DevTools → Network tab)
- The request returns 404 (no manifest published yet)
- No uncaught exceptions in the console; `useUpdater.getState().status` settles to `"idle"`

- [ ] **Step 3: Manually trigger a "available" state for visual smoke**

In the devtools console, run:

```js
useUpdater.setState({
  status: "available",
  latestVersion: "0.1.1",
  notes: "Fake update for smoke test",
  currentVersion: "0.1.0",
});
```

Confirm:
- The top banner appears above the workspace pane: "Update available — v0.1.1"
- The sidebar footer pill appears: `v0.1.1 ↑` with accent color
- Both "Install on next launch" and "Install & restart now" pill buttons render inside the banner
- Dismiss (×) button hides the banner; pill remains

- [ ] **Step 4: Smoke test error state**

```js
useUpdater.setState({ status: "error", error: "Network unreachable" });
```

Confirm:
- Banner turns `bg-conflict` (red) with the error message
- Banner shows a "Retry" button
- Pill shows "⚠ Retry"

- [ ] **Step 5: Reset to idle and quit**

```js
useUpdater.setState({ status: "idle", error: null, latestVersion: null });
```

Quit the dev server with `Ctrl+C`. No commit — this task is verification only.

---

## Phase 3: CI pipeline wiring

### Task 11: Pass signing env to tauri-action in release.yml

**Files:**
- Modify: `.github/workflows/release.yml`

Adds `TAURI_SIGNING_PRIVATE_KEY` + `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` to the `env:` block of the `Build with tauri-action` step. tauri-action detects these and emits signed update bundles (`.app.tar.gz.sig`, `.AppImage.tar.gz.sig`, `.nsis.zip.sig`) alongside the existing release artifacts.

- [ ] **Step 1: Locate the tauri-action step**

In `.github/workflows/release.yml`, find the `- name: Build with tauri-action` step (currently at lines ~95-113). Its `env:` block currently has only `GITHUB_TOKEN`.

- [ ] **Step 2: Add the two signing env vars**

Change:

```yaml
      - name: Build with tauri-action
        uses: tauri-apps/tauri-action@v0
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
        with:
```

to:

```yaml
      - name: Build with tauri-action
        uses: tauri-apps/tauri-action@v0
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
          TAURI_SIGNING_PRIVATE_KEY: ${{ secrets.TAURI_SIGNING_PRIVATE_KEY }}
          TAURI_SIGNING_PRIVATE_KEY_PASSWORD: ${{ secrets.TAURI_SIGNING_PRIVATE_KEY_PASSWORD }}
        with:
```

- [ ] **Step 3: Lint the workflow**

```bash
cd /Users/hydai/workspace/vibe/ccsettings
lineguard .github/workflows/release.yml
```

Expected: passes.

- [ ] **Step 4: Commit**

```bash
git add .github/workflows/release.yml
git commit -m "feat(ci): pass Tauri signing env to tauri-action for signed updater bundles"
```

---

### Task 12: Add the `publish-manifest` job to release.yml

**Files:**
- Modify: `.github/workflows/release.yml`

New final job that runs after the build matrix. Downloads the draft release's `.sig` files, reads each, assembles `latest.json`, uploads it to the same draft. Uses `gh` CLI (available on all GH runners).

- [ ] **Step 1: Append the new job**

At the end of `.github/workflows/release.yml`, after the existing `build:` job block, add:

```yaml
  publish-manifest:
    name: publish latest.json
    needs: build
    runs-on: ubuntu-latest
    permissions:
      contents: write
    steps:
      - uses: actions/checkout@v6

      - name: Assemble and upload latest.json
        env:
          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
          TAG: ${{ github.ref_name }}
        run: |
          set -euo pipefail
          mkdir -p /tmp/sigs
          cd /tmp/sigs

          # Pull the signed bundles' .sig sidecars from the draft release.
          # Bundle filenames follow tauri-action conventions:
          #   ccsettings_${VERSION}_aarch64.app.tar.gz.sig  (macOS arm64)
          #   ccsettings_${VERSION}_x64.app.tar.gz.sig       (macOS x86_64)
          #   ccsettings_${VERSION}_amd64.AppImage.tar.gz.sig (linux)
          #   ccsettings_${VERSION}_x64-setup.nsis.zip.sig    (windows)
          VERSION="${TAG#v}"

          for asset in \
            "ccsettings_${VERSION}_aarch64.app.tar.gz.sig" \
            "ccsettings_${VERSION}_x64.app.tar.gz.sig" \
            "ccsettings_${VERSION}_amd64.AppImage.tar.gz.sig" \
            "ccsettings_${VERSION}_x64-setup.nsis.zip.sig"; do
            gh release download "$TAG" \
              --repo "${GITHUB_REPOSITORY}" \
              --pattern "$asset" \
              --dir /tmp/sigs
          done

          DARWIN_ARM64_SIG=$(cat "ccsettings_${VERSION}_aarch64.app.tar.gz.sig")
          DARWIN_X86_64_SIG=$(cat "ccsettings_${VERSION}_x64.app.tar.gz.sig")
          LINUX_X86_64_SIG=$(cat "ccsettings_${VERSION}_amd64.AppImage.tar.gz.sig")
          WINDOWS_X86_64_SIG=$(cat "ccsettings_${VERSION}_x64-setup.nsis.zip.sig")

          BASE="https://github.com/${GITHUB_REPOSITORY}/releases/download/${TAG}"
          PUB_DATE=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

          cat > /tmp/latest.json <<EOF
          {
            "version": "${VERSION}",
            "notes": "See the CHANGELOG for details.",
            "pub_date": "${PUB_DATE}",
            "platforms": {
              "darwin-aarch64": {
                "signature": "${DARWIN_ARM64_SIG}",
                "url": "${BASE}/ccsettings_${VERSION}_aarch64.app.tar.gz"
              },
              "darwin-x86_64": {
                "signature": "${DARWIN_X86_64_SIG}",
                "url": "${BASE}/ccsettings_${VERSION}_x64.app.tar.gz"
              },
              "linux-x86_64": {
                "signature": "${LINUX_X86_64_SIG}",
                "url": "${BASE}/ccsettings_${VERSION}_amd64.AppImage.tar.gz"
              },
              "windows-x86_64": {
                "signature": "${WINDOWS_X86_64_SIG}",
                "url": "${BASE}/ccsettings_${VERSION}_x64-setup.nsis.zip"
              }
            }
          }
          EOF

          gh release upload "$TAG" /tmp/latest.json \
            --repo "${GITHUB_REPOSITORY}" \
            --clobber
```

- [ ] **Step 2: Lint**

```bash
lineguard .github/workflows/release.yml
```

Expected: passes.

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/release.yml
git commit -m "feat(ci): assemble and publish latest.json after build matrix"
```

---

### Task 13: Push all Phase 1–3 changes; verify CI green on main

**Files:** none (push + observe).

- [ ] **Step 1: Push**

```bash
cd /Users/hydai/workspace/vibe/ccsettings
git push origin main
```

- [ ] **Step 2: Watch the CI run**

```bash
sleep 8
CI_RUN=$(gh run list --workflow=ci.yml --limit 1 --json databaseId --jq '.[0].databaseId')
echo "Watching CI run $CI_RUN"
until state=$(gh run view "$CI_RUN" --json status,conclusion --jq '"\(.status) \(.conclusion)"') && [[ "$state" == *completed* ]]; do
  echo "[$(date +%H:%M:%S)] $state"
  sleep 40
done
echo "FINAL: $state"
```

Expected: `FINAL: completed success`. If failure, read the logs via `gh run view $CI_RUN --log-failed` and fix before proceeding.

---

## Phase 4: End-to-end verification against real tags

### Task 14: Cut `v0.1.1-rc.1` to exercise the signed release pipeline

**Files:**
- Modify: `package.json`, `src-tauri/Cargo.toml`, `src-tauri/tauri.conf.json`, `CHANGELOG.md`

Mirrors the prep flow from the v0.1.0-rc.1 work. The goal here is to produce signed bundles + `latest.json` and confirm the prerelease doesn't surface to stable clients.

- [ ] **Step 1: Bump manifests to `0.1.1-rc.1`**

Edit three files — `package.json`, `src-tauri/Cargo.toml`, `src-tauri/tauri.conf.json` — replacing `0.1.0` with `0.1.1-rc.1` in the `version` field only. Then:

```bash
cd src-tauri && cargo check --release && cd ..
```

Expected: `Cargo.lock` updates to `ccsettings v0.1.1-rc.1`.

- [ ] **Step 2: Add a CHANGELOG section**

Insert above the `## v0.1.0 — 2026-04-17` section:

```markdown
## v0.1.1-rc.1 — 2026-04-17

First release candidate with the in-app updater. Signed bundles and
`latest.json` manifest published — primarily a pipeline validation
before the stable v0.1.1 cut.
```

Reset the `## Unreleased` placeholder content to `(Nothing yet — changes after v0.1.1-rc.1 land here.)`.

- [ ] **Step 3: Verify locally**

```bash
cd src-tauri
cargo fmt --all -- --check
cargo clippy --release --all-targets -- -D warnings
cargo test --release
cd ..
lineguard package.json src-tauri/Cargo.toml src-tauri/tauri.conf.json CHANGELOG.md
```

Expected: all pass.

- [ ] **Step 4: Commit, push, wait for CI**

```bash
git add package.json src-tauri/Cargo.toml src-tauri/Cargo.lock src-tauri/tauri.conf.json CHANGELOG.md
git commit -m "chore(release): prep v0.1.1-rc.1"
git push origin main
```

Wait for CI to go green (as in Task 13).

- [ ] **Step 5: Tag and push**

```bash
HEAD_SHA=$(git rev-parse HEAD)
git tag v0.1.1-rc.1 "$HEAD_SHA" -m "ccsettings v0.1.1-rc.1 — updater pipeline validation"
git push origin v0.1.1-rc.1
```

- [ ] **Step 6: Watch the release workflow**

```bash
sleep 8
REL_RUN=$(gh run list --workflow=release.yml --limit 1 --json databaseId --jq '.[0].databaseId')
until state=$(gh run view "$REL_RUN" --json status,conclusion --jq '"\(.status) \(.conclusion)"') && [[ "$state" == *completed* ]]; do
  echo "[$(date +%H:%M:%S)] $state"
  sleep 75
done
echo "FINAL: $state"
```

Expected: `FINAL: completed success`. The `publish-manifest` job should succeed.

- [ ] **Step 7: Inspect the draft**

```bash
gh release view v0.1.1-rc.1 --json isDraft,isPrerelease,assets \
  --jq '{isDraft, isPrerelease, assetNames: [.assets[].name]}'
```

Expected:
- `isDraft: true`, `isPrerelease: true`
- Asset list includes at least:
  - All original 7 unsigned bundle artifacts (`.dmg`, `.AppImage`, `.deb`, `-setup.exe`, `.app.tar.gz`)
  - Four `.sig` sidecars: `aarch64.app.tar.gz.sig`, `x64.app.tar.gz.sig`, `amd64.AppImage.tar.gz.sig`, `x64-setup.nsis.zip.sig`
  - `amd64.AppImage.tar.gz` (needed for the linux updater URL)
  - `x64-setup.nsis.zip` (needed for the windows updater URL)
  - `latest.json`

If any of those are missing, fix tauri-action config / `publish-manifest` script and re-run.

- [ ] **Step 8: Publish the rc.1 draft manually**

Open https://github.com/hydai/ccsettings/releases → find v0.1.1-rc.1 → "Publish release" (keeping the "pre-release" checkbox ticked).

This makes the assets downloadable, but because `/releases/latest/` only resolves to non-prerelease tags, ccsettings v0.1.0 instances still won't see this as the latest.

---

### Task 15: Verify stable-only filter — v0.1.0 should NOT see v0.1.1-rc.1

**Files:** none (validation only).

- [ ] **Step 1: Install v0.1.0 from GitHub Releases on at least one platform**

Download the appropriate installer from https://github.com/hydai/ccsettings/releases/tag/v0.1.0 and install.

- [ ] **Step 2: Launch and observe**

- Wait 5 seconds after launch for the auto-check to fire.
- Confirm the sidebar footer pill does **NOT** light up.
- Confirm no top banner appears.

- [ ] **Step 3: Manually trigger a check**

Open devtools (Right-click → Inspect → Console) and run:

```js
useUpdater.getState().check({ manual: true })
```

Confirm:
- `useUpdater.getState().status` settles back to `"idle"` (not `"available"`)
- `useUpdater.getState().latestVersion` stays `null`

This confirms `/releases/latest/download/latest.json` resolves to v0.1.0's manifest (which doesn't exist because v0.1.0 predates the updater) or returns 404 / matches current version — either way, no offering of rc.1.

**If rc.1 IS offered:** the endpoint URL is wrong. Check `tauri.conf.json` — the URL must end in `/releases/latest/download/latest.json` (note `/latest/` which picks latest non-prerelease), NOT `/releases/v0.1.1-rc.1/download/latest.json`.

---

### Task 16: Cut stable v0.1.1, verify the live update flow

**Files:**
- Modify: `package.json`, `src-tauri/Cargo.toml`, `src-tauri/tauri.conf.json`, `CHANGELOG.md`

- [ ] **Step 1: Bump manifests to `0.1.1`**

Edit the three manifests from `0.1.1-rc.1` to `0.1.1`. Run `cd src-tauri && cargo check --release && cd ..` to update the lockfile.

- [ ] **Step 2: Promote the rc.1 changelog section**

Insert a new `## v0.1.1 — 2026-04-17` section above `## v0.1.1-rc.1 — 2026-04-17` with the following content:

```markdown
## v0.1.1 — 2026-04-17

First stable release with the in-app auto-updater. ccsettings now
detects, downloads, verifies (Ed25519), and installs new versions
from GitHub Releases without leaving the app.
```

Reset Unreleased to `(Nothing yet — changes after v0.1.1 land here.)`.

- [ ] **Step 3: Verify locally**

```bash
cd src-tauri && cargo fmt --all -- --check && cargo clippy --release --all-targets -- -D warnings && cargo test --release && cd ..
lineguard package.json src-tauri/Cargo.toml src-tauri/tauri.conf.json CHANGELOG.md
```

- [ ] **Step 4: Commit, push, wait for CI**

```bash
git add package.json src-tauri/Cargo.toml src-tauri/Cargo.lock src-tauri/tauri.conf.json CHANGELOG.md
git commit -m "chore(release): prep v0.1.1"
git push origin main
```

Watch CI until green.

- [ ] **Step 5: Tag and push**

```bash
HEAD_SHA=$(git rev-parse HEAD)
git tag v0.1.1 "$HEAD_SHA" -m "ccsettings v0.1.1 — in-app auto-updater"
git push origin v0.1.1
```

Watch the release workflow until green.

- [ ] **Step 6: Publish the stable draft manually**

In the GitHub UI, find v0.1.1 and click "Publish release". Leave prerelease unchecked.

- [ ] **Step 7: Verify update flow on the still-running v0.1.0 instance**

On the v0.1.0 install from Task 15:

1. Click the sidebar "Check now" pill or the banner's retry. (If no pill, open devtools and run `useUpdater.getState().check({ manual: true })`.)
2. Confirm banner appears: "Update available — v0.1.1"
3. Confirm sidebar pill shows `v0.1.1 ↑`
4. Click **"Install & restart now"** in the banner.
5. Confirm download progress text updates.
6. Confirm app quits and relaunches.
7. Confirm the new launch reports `v0.1.1` in the sidebar footer (if pill is visible) or run `useUpdater.getState().currentVersion` in devtools.

- [ ] **Step 8: Verify "Install on next launch" branch on a second install**

On a second machine or fresh install of v0.1.0:

1. Trigger check.
2. Click **"Install on next launch"**.
3. Confirm banner updates to "v0.1.1 will install on next launch".
4. Confirm `localStorage.getItem('ccsettings:updater:installOnNextLaunch')` returns `"true"`.
5. Quit the app.
6. Relaunch.
7. Confirm a brief "installing" pause before the window opens fully, then the app lands on v0.1.1.
8. Confirm `localStorage.getItem('ccsettings:updater:installOnNextLaunch')` now returns `null`.

If either branch fails, diagnose via:
- `gh release view v0.1.1 --json assets` — is the right `latest.json` URL?
- `curl https://github.com/hydai/ccsettings/releases/latest/download/latest.json` — does it return v0.1.1's manifest?
- Devtools console errors — signature verification failing?

---

## Self-review checklist (already run by author; included for posterity)

**Spec coverage:**
- Full auto-update flow (check → download → verify → install → restart) — Tasks 4, 8, 9
- Sidebar footer pill + conflict-style top banner — Tasks 5, 6, 7
- Startup auto-check + manual button + auto-check-on-by-default persistence — Tasks 4, 8
- "Install & restart now" vs "Install on next launch" prompt — Tasks 4, 5, 8
- Stable-only channel via `/releases/latest/` redirect — Task 9 endpoint URL + Task 15 validation
- `latest.json` on GitHub Release asset — Task 12
- Ed25519 signing — Tasks 0, 9, 11
- Draft gating preserved — Task 12 (`publish-manifest` uploads to the draft)

**Placeholder scan:** the only literal placeholder is `<PASTE_PUBLIC_KEY_FROM_USER_HERE>` in Task 9, which is specifically flagged as requiring Task 0 completion. No TODOs or TBDs elsewhere.

**Type consistency:** `check()`, `install(when)`, `dismiss()`, `setAutoCheck(on)` names and signatures match between Tasks 4 (store definition), 5 (banner usage), and 7 (pill usage). The `UpdaterStatus` type is exported from Task 4 and referenced indirectly (via `useUpdater`) by Tasks 5, 7, 8.

**Ambiguity:** `pending: Update | null` is the in-memory handle from `check()`; it's intentionally not persisted. The "install on next launch" mechanism uses a localStorage flag (Task 4 `setPendingInstall`/`hasPendingInstall`) and re-runs `check()` at startup (Task 8 `applyPendingInstall`), explicitly not attempting to cache the `Update` object.

---

## Execution handoff (choose one)

**Option 1: Subagent-Driven (recommended)** — fresh subagent per task with review checkpoints. Best for a plan this size with user-gated phases (Task 0 needs user action before Task 1 can start; Task 15 needs a user to install v0.1.0 on a real device).

**Option 2: Inline Execution** — execute tasks sequentially in this session with batch checkpoints. Faster for the mechanical tasks (1–12), still requires the user-action gates.
