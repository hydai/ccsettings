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

  setTimeout(() => {
    if (useUpdater.getState().autoCheck) {
      useUpdater.getState().check();
    }
  }, 3000);
}

bootstrap();
