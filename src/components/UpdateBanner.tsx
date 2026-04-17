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
  if (dismissed) return null;

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
      aria-live={isDownloading ? "off" : "polite"}
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
