import { useEffect } from "react";
import { useCascade } from "../state/cascade";
import { useUi } from "../state/ui";
import { useWorkspaces } from "../state/workspaces";
import { CategoryPicker } from "./CategoryPicker";
import { CategoryView } from "./CategoryView";
import { Sidebar } from "./Sidebar";
import type { Workspace } from "../types";

export function AppShell() {
  const selected = useWorkspaces(
    (s) => s.workspaces.find((w) => w.id === s.selectedId) ?? null,
  );

  return (
    <div className="flex h-screen">
      <Sidebar />
      <main className="flex-1 min-w-0 overflow-auto">
        {selected ? <WorkspacePane workspace={selected} /> : <EmptyState />}
      </main>
    </div>
  );
}

function WorkspacePane({ workspace }: { workspace: Workspace }) {
  const { merged, loading, error, load } = useCascade();
  const category = useUi((s) => s.category);

  useEffect(() => {
    load(workspace.id);
  }, [workspace.id, load]);

  return (
    <div className="p-8 max-w-6xl">
      <header className="mb-6">
        <h2 className="text-2xl font-semibold">{workspace.name}</h2>
        <p className="text-sm text-muted mt-1 font-mono">{workspace.path}</p>
      </header>

      <CategoryPicker />

      {loading && !merged && (
        <p className="text-sm text-muted">Loading cascade…</p>
      )}
      {error && (
        <div className="border border-red-500/30 bg-red-500/5 rounded p-3 text-sm text-red-500">
          {error}
        </div>
      )}
      {merged && (
        <CategoryView category={category} workspace={workspace} merged={merged} />
      )}
    </div>
  );
}

function EmptyState() {
  return (
    <div className="h-full flex items-center justify-center text-muted">
      <div className="text-center max-w-md">
        <p className="text-lg">
          Add a workspace to inspect its Claude Code settings.
        </p>
      </div>
    </div>
  );
}
