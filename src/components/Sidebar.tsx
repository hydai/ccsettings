import { open } from "@tauri-apps/plugin-dialog";
import { Plus, Search } from "lucide-react";
import { useEffect, useState } from "react";
import { cn } from "../lib/cn";
import { useWorkspaces } from "../state/workspaces";
import { DiscoverPanel } from "./DiscoverPanel";

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
    <aside className="w-64 flex-shrink-0 surface border-r border-default flex flex-col">
      <div className="p-4 border-b border-default">
        <h1 className="text-lg font-semibold">ccsettings</h1>
        <p className="text-xs text-muted">Claude Code settings inspector</p>
      </div>

      <div className="flex-1 min-h-0 overflow-auto">
        <div className="px-3 py-2 text-xs uppercase tracking-wider text-muted">
          Workspaces
        </div>

        {loading && (
          <div className="px-4 py-2 text-sm text-muted">Loading…</div>
        )}
        {error && (
          <div className="px-4 py-2 text-sm text-red-500">{error}</div>
        )}

        {isEmpty && (
          <div className="px-4 py-2 text-sm text-muted space-y-2">
            <p className="leading-snug">
              Add your first project to see the cascade of Claude Code
              settings applied to it.
            </p>
            <p className="text-xs leading-snug">
              If you've used Claude Code before, the{" "}
              <span className="font-medium">Discover</span> button below can
              find your existing projects automatically.
            </p>
          </div>
        )}

        <ul>
          {workspaces.map((w) => (
            <li key={w.id}>
              <button
                type="button"
                onClick={() => select(w.id)}
                className={cn(
                  "w-full text-left px-4 py-2 transition-colors",
                  "hover:bg-black/5 dark:hover:bg-white/5",
                  selectedId === w.id && "bg-black/10 dark:bg-white/10",
                )}
              >
                <div className="font-medium text-sm truncate">{w.name}</div>
                <div className="text-xs text-muted truncate" title={w.path}>
                  {w.path}
                </div>
              </button>
            </li>
          ))}
        </ul>

        {showDiscover && (
          <div className="p-2">
            <DiscoverPanel onClose={() => setShowDiscover(false)} />
          </div>
        )}
      </div>

      <div className="p-2 border-t border-default space-y-1">
        <button
          type="button"
          onClick={addFromPicker}
          className={cn(
            "w-full flex items-center gap-2 px-3 py-2 rounded text-sm",
            "hover:bg-black/5 dark:hover:bg-white/5",
          )}
        >
          <Plus className="w-4 h-4" />
          Add workspace
        </button>
        <button
          type="button"
          onClick={() => setShowDiscover((v) => !v)}
          className={cn(
            "w-full flex items-center gap-2 px-3 py-2 rounded text-sm",
            showDiscover
              ? "bg-black/10 dark:bg-white/10"
              : "hover:bg-black/5 dark:hover:bg-white/5",
          )}
          aria-expanded={showDiscover}
        >
          <Search className="w-4 h-4" />
          {showDiscover ? "Hide discovery" : "Discover from history"}
        </button>
      </div>
    </aside>
  );
}
