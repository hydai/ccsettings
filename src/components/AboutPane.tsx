import { invoke } from "@tauri-apps/api/core";
import { openUrl } from "@tauri-apps/plugin-opener";
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
    if (lastCheckedAt === null) return "Hasn't checked yet";
    return "✓ You're on the latest version";
  })();

  return (
    <div className="p-8 w-full max-w-6xl mx-auto space-y-8">
      <div>
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
        <p className="font-body text-sm leading-[1.55] text-body mt-2">
          A visual companion for Claude Code's layered settings — see what's
          effective for each project and edit any tier safely.
        </p>
      </div>

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

      <section className="space-y-2">
        <h3 className="font-sans text-sm font-semibold text-muted uppercase tracking-wide">
          Links
        </h3>
        <div className="flex flex-wrap gap-2">
          <LinkButton label="Repository" href={REPO_URL} />
          <LinkButton label="Issues" href={ISSUES_URL} />
          <LinkButton
            label="This release"
            href={`${REPO_URL}/releases/tag/v${currentVersion}`}
          />
        </div>
      </section>

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
        openUrl(href).catch(() => {
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
