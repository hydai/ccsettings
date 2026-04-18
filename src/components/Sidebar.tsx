import { open } from "@tauri-apps/plugin-dialog";
import { AlertTriangle, Info, Plus, Search, X } from "lucide-react";
import { useEffect, useState } from "react";
import { cn } from "../lib/cn";
import { useUi } from "../state/ui";
import { useUpdater } from "../state/updater";
import { useWorkspaces } from "../state/workspaces";
import { DiscoverPanel } from "./DiscoverPanel";
import { ThemeToggle } from "./ThemeToggle";
import { Button, SectionLabel } from "./ui";

export function Sidebar() {
  const {
    workspaces,
    selectedId,
    reload,
    select,
    add,
    remove,
    error,
    loading,
  } = useWorkspaces();
  const [showDiscover, setShowDiscover] = useState(false);

  useEffect(() => {
    reload();
  }, [reload]);

  async function addFromPicker() {
    const picked = await open({ directory: true, multiple: false });
    if (typeof picked === "string" && picked.length > 0) {
      await add(picked);
    }
  }

  const isEmpty = !loading && workspaces.length === 0 && !error;

  return (
    <aside className="w-64 flex-shrink-0 flex flex-col border-r border-hairline bg-canvas">
      <div className="px-5 py-4 border-b border-hairline">
        <h1 className="font-display text-2xl font-medium text-ink leading-none">
          ccsettings
        </h1>
        <p className="font-body text-xs text-muted mt-1">
          Claude Code settings inspector
        </p>
      </div>

      <div className="flex-1 min-h-0 overflow-auto">
        <div className="px-4 pt-4 pb-2">
          <SectionLabel>Workspaces</SectionLabel>
        </div>

        {loading && (
          <div className="px-4 py-2 font-body text-sm text-muted">Loading…</div>
        )}
        {error && (
          <div className="px-4 py-2 font-body text-sm text-danger-soft">
            {error}
          </div>
        )}

        {isEmpty && (
          <div className="px-4 py-2 font-body text-sm text-muted space-y-2 leading-[1.55]">
            <p>
              Add your first project to see the cascade of Claude Code settings
              applied to it.
            </p>
            <p className="text-xs">
              If you&apos;ve used Claude Code before, the{" "}
              <span className="font-semibold text-body">Discover</span> button
              below can find your existing projects automatically.
            </p>
          </div>
        )}

        <ul className="px-2 space-y-1">
          {workspaces.map((w) => (
            <li key={w.id}>
              <div
                className={cn(
                  "group relative rounded-soft-sm transition-colors",
                  selectedId === w.id
                    ? "bg-card shadow-soft"
                    : "hover:bg-card/60",
                )}
              >
                <button
                  type="button"
                  onClick={() => select(w.id)}
                  className={cn(
                    "w-full text-left px-3 py-2.5 pr-10 rounded-soft-sm",
                    "focus:outline-none focus-visible:shadow-focus-ink",
                    !w.exists && "opacity-60",
                  )}
                >
                  <div className="flex items-center gap-1.5">
                    {!w.exists && (
                      <AlertTriangle
                        className="w-3.5 h-3.5 text-danger-soft shrink-0"
                        aria-hidden="true"
                      />
                    )}
                    <div className="font-sans font-semibold text-sm text-ink truncate">
                      {w.name}
                    </div>
                  </div>
                  <div
                    className="font-mono text-[11px] text-muted truncate mt-0.5"
                    title={w.exists ? w.path : `Path not found: ${w.path}`}
                  >
                    {w.path}
                  </div>
                </button>
                <button
                  type="button"
                  onClick={() => remove(w.id)}
                  aria-label={`Remove ${w.name}`}
                  className={cn(
                    "absolute right-1.5 top-1/2 -translate-y-1/2",
                    "w-7 h-7 flex items-center justify-center rounded-full",
                    "text-muted hover:bg-danger-soft/10 hover:text-danger-soft",
                    "opacity-0 group-hover:opacity-100 focus-visible:opacity-100",
                    "transition-colors focus:outline-none focus-visible:shadow-focus-ink",
                  )}
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </li>
          ))}
        </ul>

        {showDiscover && (
          <div className="p-3">
            <DiscoverPanel onClose={() => setShowDiscover(false)} />
          </div>
        )}
      </div>

      <div className="p-3 border-t border-hairline space-y-1.5">
        <Button
          variant="ghost"
          size="sm"
          onClick={addFromPicker}
          className="w-full justify-start"
        >
          <Plus className="w-4 h-4" />
          Add workspace
        </Button>
        <Button
          variant={showDiscover ? "secondary" : "ghost"}
          size="sm"
          onClick={() => setShowDiscover((v) => !v)}
          className="w-full justify-start"
          aria-expanded={showDiscover}
        >
          <Search className="w-4 h-4" />
          {showDiscover ? "Hide discovery" : "Discover from history"}
        </Button>
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
    </aside>
  );
}

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
      onClick={() => {
        if (status === "error") {
          check({ manual: true });
          return;
        }
        // Re-surface the banner if the user dismissed it earlier, and
        // scroll it into view. Calling setState directly avoids a
        // pointless re-check round-trip when we already know the update.
        useUpdater.setState({ dismissed: false });
        document
          .querySelector("main")
          ?.scrollTo({ top: 0, behavior: "smooth" });
      }}
      className={cn(
        "w-full rounded-full px-3 py-1.5 font-sans text-xs font-medium",
        "transition-colors text-left",
        "focus:outline-none focus-visible:shadow-focus-ink",
        tone,
      )}
    >
      <span role="status" aria-live="polite">
        {label}
      </span>
    </button>
  );
}
