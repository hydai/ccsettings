import { useWorkspaces } from "../state/workspaces";
import { Sidebar } from "./Sidebar";

export function AppShell() {
  const selectedId = useWorkspaces((s) => s.selectedId);
  const selected = useWorkspaces((s) =>
    s.workspaces.find((w) => w.id === s.selectedId) ?? null,
  );

  return (
    <div className="flex h-screen">
      <Sidebar />
      <main className="flex-1 min-w-0 overflow-auto p-8">
        {selected ? (
          <WorkspaceHeader name={selected.name} path={selected.path} />
        ) : (
          <EmptyState hasWorkspaces={!!selectedId} />
        )}
      </main>
    </div>
  );
}

function WorkspaceHeader({ name, path }: { name: string; path: string }) {
  return (
    <header className="max-w-3xl">
      <h2 className="text-2xl font-semibold">{name}</h2>
      <p className="text-sm text-muted mt-1 font-mono">{path}</p>
      <p className="mt-6 text-sm text-muted">
        Cascade inspector and category editors land in Phase 2B.
      </p>
    </header>
  );
}

function EmptyState({ hasWorkspaces }: { hasWorkspaces: boolean }) {
  return (
    <div className="h-full flex items-center justify-center text-muted">
      <div className="text-center max-w-md">
        <p className="text-lg">
          {hasWorkspaces
            ? "Select a workspace on the left."
            : "Add a workspace to inspect its Claude Code settings."}
        </p>
      </div>
    </div>
  );
}
