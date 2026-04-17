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
    if (raw === null) return true;
    return raw === "true";
  } catch {
    return true;
  }
}

function writeAutoCheck(v: boolean) {
  try {
    localStorage.setItem(AUTO_CHECK_KEY, v ? "true" : "false");
  } catch {
    // storage quota or private-mode restrictions — silently skip persistence.
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
  currentVersion: "0.0.0",
  latestVersion: null,
  notes: null,
  progress: null,
  error: null,
  autoCheck: readAutoCheck(),
  dismissed: false,
  pending: null,

  async check(opts) {
    const manual = opts?.manual ?? false;
    // Reset transient fields so a previous download's progress / latest
    // info doesn't linger into the new cycle.
    set({
      status: "checking",
      error: null,
      dismissed: false,
      progress: null,
      latestVersion: null,
      notes: null,
      pending: null,
    });

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
      // Always set status to "error" so the sidebar pill surfaces "⚠ Retry".
      // For auto-checks we additionally pre-dismiss the banner so the error
      // stays silent in the main pane — users notice the pill at their
      // leisure, clicking it un-dismisses and reveals the banner's retry.
      set({ status: "error", error: msg, dismissed: !manual });
    }
  },

  async install(when) {
    const update = get().pending;
    if (!update) return;

    if (when === "next-launch") {
      try {
        set({
          status: "downloading",
          progress: { downloaded: 0, total: null },
        });
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
        set({ status: "ready", progress: null });
      } catch (e) {
        set({
          status: "error",
          error: e instanceof Error ? e.message : String(e),
        });
      }
      return;
    }

    try {
      set({
        status: "downloading",
        progress: { downloaded: 0, total: null },
      });
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
    } catch (e) {
      set({
        status: "error",
        error: e instanceof Error ? e.message : String(e),
      });
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
