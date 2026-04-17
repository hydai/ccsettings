import { check } from "@tauri-apps/plugin-updater";
import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import {
  clearPendingInstall,
  hasPendingInstall,
  useUpdater,
} from "./state/updater";
import "./styles.css";

async function applyPendingInstall() {
  try {
    const update = await check();
    if (!update) {
      // Already on latest — nothing to install, drop the flag.
      clearPendingInstall();
      return;
    }

    // Clear inside this branch so a transient check() failure above keeps
    // the flag set for the next launch to retry, but a broken bundle
    // (signature/install error from downloadAndInstall) doesn't trap the
    // user in an infinite install-retry loop on every boot.
    clearPendingInstall();

    try {
      await update.downloadAndInstall();
      // downloadAndInstall triggers a relaunch on success; execution does
      // not typically reach the next line.
    } catch (e) {
      // The pending install failed (download error, signature mismatch, IO
      // failure). Stage the error on the store before React mounts so the
      // sidebar pill + banner reflect it once UI comes up, instead of
      // silently dropping the user's pending-install attempt.
      const msg = e instanceof Error ? e.message : String(e);
      useUpdater.setState({
        status: "error",
        error: `Pending install failed: ${msg}`,
        dismissed: true,
      });
    }
  } catch {
    // check() itself threw (network unreachable etc.). Stay silent here —
    // the flag remains set so the next launch retries, and because status
    // stays "idle" the +3s delayed auto-check in bootstrap() will also fire
    // once React mounts, giving the user in-session feedback if the network
    // is still down.
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

  setTimeout(() => {
    const s = useUpdater.getState();
    // Only fire the delayed auto-check if the store is pristine. If
    // applyPendingInstall already staged a status (e.g. "error" from a
    // failed pending install), a fresh check() would wipe that feedback
    // before the user had a chance to see it.
    if (s.autoCheck && s.status === "idle") {
      s.check();
    }
  }, 3000);
}

bootstrap();
