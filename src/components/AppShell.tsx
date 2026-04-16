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
    <div className="p-8 w-full max-w-6xl mx-auto">
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
    <div className="h-full flex items-center justify-center p-8">
      <div className="max-w-xl space-y-6">
        <div>
          <h2 className="text-2xl font-semibold mb-1">Welcome to ccsettings</h2>
          <p className="text-sm text-muted">
            A visual companion for Claude Code's layered settings — see what's
            effective for each project and edit any tier safely.
          </p>
        </div>

        <ol className="space-y-3 text-sm">
          <Step n={1}>
            <strong>Add a workspace</strong> on the left — pick a folder
            directly or let Discover pull projects Claude Code has already
            touched.
          </Step>
          <Step n={2}>
            <strong>Open the Overview tab</strong> — a five-tier cascade header
            shows which file supplied every top-level setting.
          </Step>
          <Step n={3}>
            <strong>Pick a category</strong> to edit — Permissions, Env, Hooks,
            MCP, and four more. Every save writes atomically with a SHA-256
            precondition, and snapshots the prior content in Backups.
          </Step>
        </ol>

        <p className="text-xs text-muted">
          Nothing leaves your machine. ccsettings only reads and writes files
          you can already edit by hand.
        </p>
      </div>
    </div>
  );
}

function Step({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <li className="flex gap-3">
      <span className="flex-shrink-0 w-6 h-6 rounded-full bg-black/10 dark:bg-white/10 text-xs flex items-center justify-center font-medium">
        {n}
      </span>
      <span className="pt-0.5">{children}</span>
    </li>
  );
}
