import { useEffect } from "react";
import { useCascade } from "../state/cascade";
import { useUi } from "../state/ui";
import { useWorkspaces } from "../state/workspaces";
import { Card } from "./ui";
import { CategoryPicker } from "./CategoryPicker";
import { CategoryView } from "./CategoryView";
import { Sidebar } from "./Sidebar";
import { UpdateBanner } from "./UpdateBanner";
import type { Workspace } from "../types";

export function AppShell() {
  const selected = useWorkspaces(
    (s) => s.workspaces.find((w) => w.id === s.selectedId) ?? null,
  );

  return (
    <div className="flex h-screen bg-canvas">
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
    <div className="p-8 w-full max-w-6xl mx-auto space-y-6">
      <header>
        <h2 className="font-sans text-2xl font-semibold text-ink leading-tight">
          {workspace.name}
        </h2>
        <p className="font-mono text-xs text-muted mt-1.5">{workspace.path}</p>
      </header>

      <UpdateBanner />

      <CategoryPicker />

      {loading && !merged && (
        <p className="font-body text-sm text-muted">Loading cascade…</p>
      )}
      {error && (
        <Card
          variant="soft"
          className="border-l-[3px] border-danger-soft p-4 text-sm text-danger-soft"
        >
          {error}
        </Card>
      )}
      {merged && (
        <CategoryView
          category={category}
          workspace={workspace}
          merged={merged}
        />
      )}
    </div>
  );
}

function EmptyState() {
  return (
    <div className="h-full flex flex-col items-center justify-center p-8 gap-6">
      <div className="w-full max-w-xl empty:hidden">
        <UpdateBanner />
      </div>
      <Card variant="soft" className="max-w-xl p-10 space-y-6">
        <div>
          <h2 className="font-display text-3xl font-medium text-ink leading-tight mb-2">
            Welcome to ccsettings
          </h2>
          <p className="font-body text-sm leading-[1.55] text-body">
            A visual companion for Claude Code&apos;s layered settings — see
            what&apos;s effective for each project and edit any tier safely.
          </p>
        </div>

        <ol className="space-y-4">
          <Step n={1}>
            <strong className="font-semibold text-ink">Add a workspace</strong>{" "}
            on the left — pick a folder directly or let Discover pull projects
            Claude Code has already touched.
          </Step>
          <Step n={2}>
            <strong className="font-semibold text-ink">
              Open the Overview tab
            </strong>{" "}
            — a five-tier cascade header shows which file supplied every
            top-level setting.
          </Step>
          <Step n={3}>
            <strong className="font-semibold text-ink">Pick a category</strong>{" "}
            to edit — Permissions, Env, Hooks, MCP, and four more. Every save
            writes atomically with a SHA-256 precondition, and snapshots the
            prior content in Backups.
          </Step>
        </ol>

        <p className="font-body text-xs text-muted leading-[1.55]">
          Nothing leaves your machine. ccsettings only reads and writes files
          you can already edit by hand.
        </p>
      </Card>
    </div>
  );
}

function Step({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <li className="flex gap-3 font-body text-sm leading-[1.55] text-body">
      <span className="flex-shrink-0 w-6 h-6 rounded-full bg-inverse text-on-inverse text-xs flex items-center justify-center font-sans font-semibold">
        {n}
      </span>
      <span className="pt-0.5">{children}</span>
    </li>
  );
}
