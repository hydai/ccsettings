import { invoke } from "@tauri-apps/api/core";
import { ChevronDown, History } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { cn } from "../lib/cn";
import { Button, Card } from "./ui";

export type BackupEntry = {
  id: string;
  source_path: string;
  backup_path: string;
  created_unix_millis: number;
  size_bytes: number;
  content_hash: string;
};

type Props = {
  /** Async thunk that calls the right list_backups_for_* command. */
  fetchBackups: () => Promise<BackupEntry[]>;
  /** Current on-disk hash of the file — used as the restore precondition. */
  currentHash: string | null;
  /** Called after a successful restore so the parent can re-fetch its state. */
  onRestored: () => Promise<void> | void;
};

export function BackupsList({ fetchBackups, currentHash, onRestored }: Props) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [entries, setEntries] = useState<BackupEntry[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [restoringId, setRestoringId] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const list = await fetchBackups();
      setEntries(list);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, [fetchBackups]);

  useEffect(() => {
    if (open) reload();
  }, [open, reload]);

  async function restore(id: string) {
    if (restoringId) return;
    const ok = confirm(
      "Restore this backup? The current file will be overwritten. " +
        "A fresh backup of the current content is captured first.",
    );
    if (!ok) return;
    setRestoringId(id);
    setError(null);
    try {
      await invoke<{
        path: string;
        new_hash: string;
        size_bytes: number;
      }>("restore_backup", {
        backupId: id,
        expectedHash: currentHash,
      });
      await onRestored();
      await reload();
    } catch (e) {
      setError(String(e));
    } finally {
      setRestoringId(null);
    }
  }

  return (
    <section>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "inline-flex items-center gap-1.5 rounded-full px-3 py-1.5",
          "font-sans text-xs text-muted hover:text-ink hover:bg-canvas transition-colors",
          "focus:outline-none focus-visible:shadow-focus-ink",
        )}
        aria-expanded={open}
      >
        <History className="w-3.5 h-3.5" />
        {open ? "Hide backups" : "Show backups"}
        {entries.length > 0 && (
          <span className="text-muted">({entries.length})</span>
        )}
        <ChevronDown
          className={cn(
            "w-3.5 h-3.5 transition-transform",
            open && "rotate-180",
          )}
        />
      </button>

      {open && (
        <Card variant="soft" className="mt-2 overflow-hidden">
          {loading && (
            <p className="font-body text-xs text-muted px-4 py-3">Loading…</p>
          )}
          {error && (
            <div className="border-[1.5px] border-danger-soft rounded-soft-sm m-3 p-3 font-body text-xs text-danger-soft">
              {error.startsWith("conflict:")
                ? "The file changed on disk since you loaded it. Discard your current view first, then try Restore again."
                : error}
            </div>
          )}
          {!loading && entries.length === 0 && !error && (
            <p className="font-body text-xs text-muted px-4 py-3 italic">
              No backups yet. Each save captures one automatically.
            </p>
          )}
          <ul className="divide-y divide-hairline">
            {entries.map((e) => (
              <li key={e.id}>
                <div className="flex items-center gap-3 px-4 py-3">
                  <div className="flex-1 min-w-0">
                    <div className="font-sans text-xs text-ink">
                      {formatAgo(e.created_unix_millis)} ·{" "}
                      <span className="text-muted">
                        {humanBytes(e.size_bytes)}
                      </span>
                    </div>
                    <div
                      className="font-mono text-[11px] text-muted truncate mt-0.5"
                      title={`${e.backup_path}\nSHA-256: ${e.content_hash}`}
                    >
                      {e.content_hash.slice(0, 12)}…
                    </div>
                  </div>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => restore(e.id)}
                    disabled={!!restoringId}
                  >
                    {restoringId === e.id ? "Restoring…" : "Restore"}
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </section>
  );
}

function formatAgo(ms: number): string {
  const now = Date.now();
  const diff = Math.max(0, now - ms);
  const s = Math.floor(diff / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d ago`;
  return new Date(ms).toLocaleDateString();
}

function humanBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}
