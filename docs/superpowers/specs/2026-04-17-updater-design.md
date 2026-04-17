# Design — In-app auto-updater via `tauri-plugin-updater`

> Status: **approved** 2026-04-17 after brainstorming session.
> Implementation plan: TBD (will be authored via the `writing-plans` skill in a follow-up step).

## Context

ccsettings v0.1.0 just shipped on 2026-04-17. The release pipeline already emits `.app.tar.gz` artifacts alongside `.dmg` / `.AppImage` / `.deb` / `.exe`, so the file formats the Tauri updater consumes are partially in place — what's missing is the signing step, a published `latest.json` manifest, and the in-app UI + state.

Goal: a full in-app auto-updater. On startup (and on manual click) the app queries a manifest, verifies the Ed25519 signature of the proposed bundle, prompts the user, and relaunches into the new version. No browser jumps, no manual downloads.

## Decisions

| Question | Decision |
|---|---|
| Scope | Full in-app auto-update via `tauri-plugin-updater` |
| UI placement | Sidebar-footer version pill + conflict-banner-style top banner |
| Check cadence | Startup-only auto-check + manual "Check now" button |
| Default auto-check state | On by default, persisted toggle |
| Install flow | Prompt: "Install & restart now" vs "Install on next launch" |
| Channel scope | Stable only (prereleases filtered via `/releases/latest/` redirect) |
| Manifest hosting | GitHub Release asset, `latest.json` |
| Endpoint URL | `https://github.com/hydai/ccsettings/releases/latest/download/latest.json` |
| Signing scheme | Ed25519 keypair, password-protected |
| Private key storage | GHA secret `TAURI_SIGNING_PRIVATE_KEY` (+ `_PASSWORD`) |
| Public key storage | Inlined in `src-tauri/tauri.conf.json` |

## Architecture

```
 Startup (+3s delay)      Manual "Check now" button
         │                         │
         └──────────┬──────────────┘
                    ▼
           useUpdater().check()
                    ▼
     @tauri-apps/plugin-updater::check()  ← GET latest.json over TLS
                    ▼
         Ed25519 signature fetched per platform
                    ▼
     status = 'available'  (footer pill lights up, banner appears)
                    ▼
           user clicks "Install now"
                    ▼
     update.downloadAndInstall(progressCb)  ← streams platform bundle
                    ▼
     status = 'downloading' → 'installing'    ← "Install now" branch
                    ▼
     plugin relaunches the app (Tauri does this atomically per-platform)

     (or) status = 'ready'                    ← "Install on next launch" branch
                    ▼
     payload stashed; applied before mount at next startup
```

Failure modes funnel into `status = 'error'` with a retry button. Silent failures on startup auto-check (no banner); visible failures on manual "Check now" (banner shows error text).

## Components

### Rust (`src-tauri/`)

- **`Cargo.toml`** — add `tauri-plugin-updater = "2"`.
- **`src/lib.rs:20`** — register the plugin in the `tauri::Builder` chain.
- **`tauri.conf.json`** — add `plugins.updater` block with endpoint URL + public key.

### Frontend (`src/`)

- **`state/updater.ts`** *(new)* — zustand store exposing the state machine (`idle|checking|available|downloading|ready|error`), persisted `autoCheck` preference (localStorage key `ccsettings:updater:autoCheck`), and actions `check({manual})`, `install('now'|'next-launch')`, `dismiss()`, `setAutoCheck()`. Pattern mirrors `state/theme.ts`.
- **`components/UpdateBanner.tsx`** *(new)* — reuses the `h-16 rounded-soft-md` shell from `components/SaveControls.tsx:28-80`. Color pair: `bg-inverse` / `text-on-inverse`. Renders copy + CTA set based on current state.
- **`components/Sidebar.tsx:101-122`** — add a status pill next to `<ThemeToggle />`. Idle = nothing visible; `available|ready` = accent-colored `v0.1.1 ↑` pill; `error` = `⚠ Retry` pill. Clicking the pill scrolls the banner into view.
- **`components/AppShell.tsx`** — mount `<UpdateBanner />` above `<CategoryView />`.
- **`main.tsx`** — kick off `useUpdater.getState().check()` ~3s after mount, gated on `autoCheck`.

### CI (`.github/workflows/release.yml`)

1. Pass `TAURI_SIGNING_PRIVATE_KEY` + `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` as env to the `tauri-action` step. This makes tauri-action emit signed update bundles (`.sig` sidecars) alongside the existing release artifacts.
2. Add a final `publish-manifest` job (`needs: build`) that:
   - downloads the draft release's asset list via `gh release view --json assets`,
   - reads each platform's `.sig` file,
   - assembles a `latest.json` with platform → `{signature, url}` mapping,
   - uploads `latest.json` via `gh release upload`.
3. Keep `releaseDraft: true`. The endpoint `/releases/latest/download/latest.json` resolves to the most-recently-*published* non-prerelease — drafts remain invisible to end users until manually promoted.

## Data flow

### `latest.json` shape

```jsonc
{
  "version": "0.1.1",
  "notes": "See CHANGELOG",
  "pub_date": "2026-04-24T08:40:00Z",
  "platforms": {
    "darwin-aarch64":  { "signature": "<base64>", "url": "https://github.com/…/ccsettings.app.tar.gz" },
    "darwin-x86_64":   { "signature": "<base64>", "url": "…" },
    "linux-x86_64":    { "signature": "<base64>", "url": "https://…/ccsettings.AppImage.tar.gz" },
    "windows-x86_64":  { "signature": "<base64>", "url": "https://…/ccsettings-setup.nsis.zip" }
  }
}
```

Per-platform bundle formats: macOS `.app.tar.gz`, Linux `.AppImage.tar.gz`, Windows `.nsis.zip` (of the NSIS `-setup.exe`). Tauri-action emits these automatically when signing env is present.

### State transitions (frontend)

```
idle ──check──▶ checking ──ok──▶ available / idle (no update)
                      └──err─▶ error
available ──install('now')──▶ downloading ──ok──▶ installing ── app relaunches
                                      └──err──▶ error
available ──install('next-launch')──▶ ready (persists download, consumed on next startup before mount)
available ──dismiss──▶ idle (banner hidden; pill remains visible)
error ──check(manual:true)──▶ checking (retry)
```

## Error handling

| Failure | Surfacing |
|---|---|
| Network unreachable on startup auto-check | Silent — no banner, pill stays idle |
| Network unreachable on manual "Check now" | Banner with error text + retry button |
| `latest.json` malformed / endpoint 404 | Treated as "no update"; logged to console only |
| Ed25519 signature mismatch | Banner with "Signature verification failed — please report this"; never auto-retry |
| Disk full during download | Banner with error + retry |
| Installer fails to apply on next launch | Next startup falls back to currently-installed version, surfaces a banner |

Never bypass signature verification. Never show a dismissable "Update anyway?" option for verification failures — those are security events.

## Testing

### Local dev

```bash
cd src-tauri && cargo fmt --check && cargo clippy --release --all-targets -- -D warnings && cargo test --release
npm run tauri dev
```

Manual UI smoke: hand-craft a `status = 'available'` state in devtools, confirm banner shell, colors, pill layout. Toggle `autoCheck` and confirm localStorage persistence.

### End-to-end proof

Sequenced against real tags:

1. Merge implementation to `main`.
2. Cut `v0.1.1-rc.1`. Release workflow should emit signed bundles + `latest.json` to the draft. Publish the draft manually.
3. Install the **v0.1.0** stable installer on a test machine. Launch.
4. Click "Check now". Confirm rc.1 is **NOT** offered (channel-filter sanity check — `/releases/latest/` skips prereleases).
5. Cut `v0.1.1` stable. Publish.
6. On the same v0.1.0 instance, click "Check now". Confirm banner shows `v0.1.1`, download progresses, prompt appears. Click "Install & restart now" — verify relaunch into v0.1.1.
7. Repeat step 6 on a second instance, choose "Install on next launch". Quit. Relaunch. Confirm silent pre-mount install.

### Regressions to watch

| If … | Symptom |
|---|---|
| Wrong public key inlined | Signature verification fails on every update (step 6) |
| `latest.json` URLs wrong | "Could not download update" (step 6) |
| Prerelease filter missed | rc.1 offered (step 4) |
| Banner never mounts | No updates ever visible (local dev) |

## User actions outside the codebase

Unavoidable manual steps — I cannot touch the user's local keychain or GHA secrets:

```bash
# 1. Generate the keypair. Prompts for a passphrase.
npm exec tauri signer generate -- -w ~/.tauri/ccsettings.key

# 2. Upload the private key + passphrase as GitHub repo secrets.
gh secret set TAURI_SIGNING_PRIVATE_KEY < ~/.tauri/ccsettings.key
gh secret set TAURI_SIGNING_PRIVATE_KEY_PASSWORD   # paste passphrase interactively

# 3. Share the public key contents with me so I can embed it in tauri.conf.json.
cat ~/.tauri/ccsettings.key.pub
```

## Scope boundaries

**In scope:**
- Full auto-update pipeline (check → download → verify → install → relaunch)
- Footer pill + conflict-style top banner UI
- Startup auto-check + manual "Check now"
- Stable-channel filtering
- Ed25519 signing in CI + `latest.json` publish

**Out of scope:**
- Delta updates — Tauri ships full bundles; binary diffing isn't available.
- In-app rollback mechanism — users downgrade via the normal installer.
- User-selectable beta channel — clean future addition (second endpoint + radio in banner settings).
- Apple / Windows code-signing — orthogonal to updater signing; Gatekeeper/SmartScreen warnings persist until code-signing is configured.
- Updater telemetry / "update applied" events.

## Follow-up work

After this lands, natural next PRs:
- Wire up macOS notarization (adds `APPLE_*` secret setup + re-enables the existing conditional signing path).
- Add a beta channel radio backed by a second `latest-beta.json` endpoint.
- Surface the currently-installed version prominently somewhere (About panel or similar).
