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
    if (update) {
      // Clear inside this branch so a transient check() failure above keeps
      // the flag set for the next launch to retry, but a broken bundle
      // (signature/install error from downloadAndInstall) doesn't trap the
      // user in an infinite install-retry loop on every boot.
      clearPendingInstall();
      await update.downloadAndInstall();
      // downloadAndInstall triggers a relaunch on success; execution does
      // not typically reach the next line.
    } else {
      // Already on latest — nothing to install, drop the flag.
      clearPendingInstall();
    }
  } catch {
    // check() itself threw (network unreachable etc.) — leave the flag set
    // so we retry on the next launch. User can also dismiss via the banner.
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
    if (useUpdater.getState().autoCheck) {
      useUpdater.getState().check();
    }
  }, 3000);
}

bootstrap();
