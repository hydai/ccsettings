import { Loader2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { cn } from "../lib/cn";
import { useWorkspaces } from "../state/workspaces";
import type { DiscoveredProject } from "../types";
import { Button, Card, HelpNote } from "./ui";

type Props = {
  onClose: () => void;
};

export function DiscoverPanel({ onClose }: Props) {
  const discover = useWorkspaces((s) => s.discover);
  const add = useWorkspaces((s) => s.add);
  const workspaces = useWorkspaces((s) => s.workspaces);
  const existingPaths = useMemo(
    () => new Set(workspaces.map((w) => w.path)),
    [workspaces],
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
    <Card
      variant="soft"
      className="max-h-[60vh] overflow-hidden flex flex-col"
    >
      <div className="p-3 border-b border-hairline flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="font-sans text-sm font-semibold text-ink">
            Projects Claude Code has touched
          </div>
          <div className="font-body text-[11px] text-muted mt-0.5 leading-[1.4]">
            Pulled from ~/.claude/projects/ · {importable.length} available ·{" "}
            {candidates.length - importable.length} already added
          </div>
        </div>
        <Button variant="ghost" size="sm" onClick={onClose}>
          Close
        </Button>
      </div>

      {loading && (
        <div className="p-4 flex items-center gap-2 font-body text-sm text-muted">
          <Loader2 className="w-4 h-4 animate-spin" />
          Reading transcript metadata…
        </div>
      )}

      {error && (
        <div className="m-3 border-[1.5px] border-danger-soft bg-canvas rounded-soft-sm p-3 font-body text-sm text-danger-soft">
          {error}
        </div>
      )}

      {!loading && importable.length === 0 && !error && (
        <HelpNote className="p-4 italic">
          Nothing new to import. Either Claude Code hasn&apos;t opened any
          projects yet, or every discovered project is already in your workspace
          list.
        </HelpNote>
      )}

      <ul className="flex-1 overflow-auto divide-y divide-hairline">
        {importable.map((c) => {
          const isSelected = c.cwd ? selected.has(c.cwd) : false;
          return (
            <li key={c.slug}>
              <label
                className={cn(
                  "flex items-start gap-3 px-3 py-2.5 cursor-pointer transition-colors",
                  isSelected ? "bg-canvas" : "hover:bg-canvas/60",
                )}
              >
                <input
                  type="checkbox"
                  checked={isSelected}
                  onChange={() => c.cwd && toggle(c.cwd)}
                  className="mt-1 accent-ink"
                />
                <div className="flex-1 min-w-0">
                  <div className="font-sans text-sm font-semibold text-ink truncate">
                    {basenameOf(c.cwd)}
                  </div>
                  <div
                    className="font-mono text-[10px] text-muted truncate mt-0.5"
                    title={c.cwd ?? ""}
                    dir="rtl"
                    style={{ textAlign: "left" }}
                  >
                    {c.cwd}
                  </div>
                  <div className="font-body text-[10px] text-muted mt-0.5">
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
        <div className="border-t border-hairline p-3 flex items-center justify-between">
          <div className="font-body text-xs text-muted">
            {selected.size} selected
          </div>
          <div className="flex gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={onClose}
              disabled={importing}
            >
              Cancel
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={importSelected}
              disabled={selected.size === 0 || importing}
            >
              {importing ? "Importing…" : `Import ${selected.size}`}
            </Button>
          </div>
        </div>
      )}
    </Card>
  );
}

function basenameOf(p: string | null): string {
  if (!p) return "(unknown)";
  const parts = p.split("/").filter(Boolean);
  return parts[parts.length - 1] ?? p;
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
