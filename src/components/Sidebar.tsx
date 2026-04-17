import { open } from "@tauri-apps/plugin-dialog";
import { Plus, Search } from "lucide-react";
import { useEffect, useState } from "react";
import { cn } from "../lib/cn";
import { useUpdater } from "../state/updater";
import { useWorkspaces } from "../state/workspaces";
import { DiscoverPanel } from "./DiscoverPanel";
import { ThemeToggle } from "./ThemeToggle";
import { Button, SectionLabel } from "./ui";

export function Sidebar() {
  const { workspaces, selectedId, reload, select, add, error, loading } =
    useWorkspaces();
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
              <button
                type="button"
                onClick={() => select(w.id)}
                className={cn(
                  "w-full text-left px-3 py-2.5 rounded-soft-sm transition-colors",
                  selectedId === w.id
                    ? "bg-card shadow-soft"
                    : "hover:bg-card/60",
                )}
              >
                <div className="font-sans font-semibold text-sm text-ink truncate">
                  {w.name}
                </div>
                <div
                  className="font-mono text-[11px] text-muted truncate mt-0.5"
                  title={w.path}
                >
                  {w.path}
                </div>
              </button>
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
      onClick={() =>
        status === "error"
          ? check({ manual: true })
          : document
              .querySelector("main")
              ?.scrollTo({ top: 0, behavior: "smooth" })
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
