import { Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import { cn } from "../lib/cn";
import { useWorkspaces } from "../state/workspaces";
import type { DiscoveredProject } from "../types";

type Props = {
  onClose: () => void;
};

export function DiscoverPanel({ onClose }: Props) {
  const discover = useWorkspaces((s) => s.discover);
  const add = useWorkspaces((s) => s.add);
  const existingPaths = useWorkspaces((s) =>
    new Set(s.workspaces.map((w) => w.path)),
  );

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [candidates, setCandidates] = useState<DiscoveredProject[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [importing, setImporting] = useState(false);

  useEffect(() => {
    let active = true;
    setLoading(true);
    discover()
      .then((list) => {
        if (!active) return;
        setCandidates(list);
        setLoading(false);
      })
      .catch((e) => {
        if (!active) return;
        setError(String(e));
        setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [discover]);

  function toggle(cwd: string) {
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(cwd)) next.delete(cwd);
      else next.add(cwd);
      return next;
    });
  }

  async function importSelected() {
    setImporting(true);
    setError(null);
    try {
      for (const cwd of selected) {
        await add(cwd);
      }
      onClose();
    } catch (e) {
      setError(String(e));
    } finally {
      setImporting(false);
    }
  }

  const importable = candidates.filter(
    (c) => c.cwd && !existingPaths.has(c.cwd),
  );

  return (
    <div className="border border-default rounded surface max-h-[60vh] overflow-auto">
      <div className="sticky top-0 surface border-b border-default p-3 flex items-center justify-between">
        <div>
          <div className="text-sm font-medium">
            Projects Claude Code has touched
          </div>
          <div className="text-xs text-muted">
            Pulled from ~/.claude/projects/ · {importable.length} available ·{" "}
            {candidates.length - importable.length} already added
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="text-xs text-muted hover:text-current px-2 py-1 rounded hover:bg-black/5 dark:hover:bg-white/5"
        >
          Close
        </button>
      </div>

      {loading && (
        <div className="p-4 flex items-center gap-2 text-sm text-muted">
          <Loader2 className="w-4 h-4 animate-spin" />
          Reading transcript metadata…
        </div>
      )}

      {error && (
        <div className="m-3 border border-red-500/30 bg-red-500/5 rounded p-3 text-sm text-red-500">
          {error}
        </div>
      )}

      {!loading && importable.length === 0 && !error && (
        <div className="p-4 text-sm text-muted italic">
          Nothing new to import. Either Claude Code hasn't opened any projects
          yet, or every discovered project is already in your workspace list.
        </div>
      )}

      <ul className="divide-y divide-default/40">
        {importable.map((c) => {
          const isSelected = c.cwd ? selected.has(c.cwd) : false;
          return (
            <li key={c.slug}>
              <label
                className={cn(
                  "flex items-start gap-3 px-3 py-2 cursor-pointer",
                  "hover:bg-black/5 dark:hover:bg-white/5",
                  isSelected && "bg-black/5 dark:bg-white/5",
                )}
              >
                <input
                  type="checkbox"
                  checked={isSelected}
                  onChange={() => c.cwd && toggle(c.cwd)}
                  className="mt-1"
                />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-mono truncate" title={c.cwd ?? ""}>
                    {c.cwd}
                  </div>
                  <div className="text-xs text-muted">
                    {c.transcript_count} transcript
                    {c.transcript_count === 1 ? "" : "s"}
                    {c.last_active_unix_millis
                      ? ` · ${timeAgo(c.last_active_unix_millis)}`
                      : ""}
                  </div>
                </div>
              </label>
            </li>
          );
        })}
      </ul>

      {importable.length > 0 && (
        <div className="sticky bottom-0 surface border-t border-default p-3 flex items-center justify-between">
          <div className="text-xs text-muted">
            {selected.size} selected
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={importing}
              className="px-3 py-1.5 rounded text-sm border border-default hover:bg-black/5 dark:hover:bg-white/5"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={importSelected}
              disabled={selected.size === 0 || importing}
              className={cn(
                "px-3 py-1.5 rounded text-sm font-medium",
                selected.size > 0 && !importing
                  ? "bg-blue-600 text-white hover:bg-blue-700"
                  : "bg-black/10 dark:bg-white/10 text-muted cursor-not-allowed",
              )}
            >
              {importing ? "Importing…" : `Import ${selected.size}`}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function timeAgo(ms: number): string {
  const diff = Math.max(0, Date.now() - ms);
  const days = Math.floor(diff / 86_400_000);
  if (days < 1) return "today";
  if (days === 1) return "1 day ago";
  if (days < 30) return `${days} days ago`;
  const months = Math.floor(days / 30);
  if (months === 1) return "1 month ago";
  if (months < 12) return `${months} months ago`;
  const years = Math.floor(days / 365);
  return years === 1 ? "1 year ago" : `${years} years ago`;
}
