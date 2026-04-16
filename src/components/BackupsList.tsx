import { invoke } from "@tauri-apps/api/core";
import { History } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { cn } from "../lib/cn";

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
  /** Called after a successful restore so the parent can re-fetch its own state. */
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
          "flex items-center gap-2 text-xs text-muted hover:text-current",
          "px-2 py-1 rounded hover:bg-black/5 dark:hover:bg-white/5",
        )}
        aria-expanded={open}
      >
        <History className="w-3.5 h-3.5" />
        {open ? "Hide backups" : "Show backups"}
        {entries.length > 0 && <span className="text-muted">({entries.length})</span>}
      </button>

      {open && (
        <div className="mt-2 border border-default rounded surface p-2 space-y-1">
          {loading && <p className="text-xs text-muted px-2 py-1">Loading…</p>}
          {error && (
            <div className="text-xs text-red-500 border border-red-500/30 bg-red-500/5 rounded p-2">
              {error.startsWith("conflict:")
                ? "The file changed on disk since you loaded it. Discard your current view first, then try Restore again."
                : error}
            </div>
          )}
          {!loading && entries.length === 0 && !error && (
            <p className="text-xs text-muted px-2 py-1 italic">
              No backups yet. Each save captures one automatically.
            </p>
          )}
          {entries.map((e) => (
            <div
              key={e.id}
              className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-black/5 dark:hover:bg-white/5"
            >
              <div className="flex-1 min-w-0">
                <div className="text-xs font-mono">
                  {formatAgo(e.created_unix_millis)} ·{" "}
                  <span className="text-muted">{humanBytes(e.size_bytes)}</span>
                </div>
                <div
                  className="text-[10px] text-muted font-mono truncate"
                  title={`${e.backup_path}\nSHA-256: ${e.content_hash}`}
                >
                  {e.content_hash.slice(0, 12)}…
                </div>
              </div>
              <button
                type="button"
                onClick={() => restore(e.id)}
                disabled={!!restoringId}
                className={cn(
                  "px-2 py-1 rounded text-xs border border-default",
                  restoringId === e.id
                    ? "opacity-50 cursor-wait"
                    : restoringId
                      ? "opacity-40 cursor-not-allowed"
                      : "hover:bg-black/10 dark:hover:bg-white/10",
                )}
              >
                {restoringId === e.id ? "Restoring…" : "Restore"}
              </button>
            </div>
          ))}
        </div>
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
