import { invoke } from "@tauri-apps/api/core";
import { useEffect, useState } from "react";
import { cn } from "../lib/cn";
import type { Workspace } from "../types";
import { BackupsList, type BackupEntry } from "./BackupsList";
import { SaveControls } from "./SaveControls";

type Scope = "user" | "project";
type Kind = "claude" | "agents" | "gemini";

const SCOPES: { id: Scope; label: string }[] = [
  { id: "user", label: "User (~/.claude/)" },
  { id: "project", label: "Project root" },
];

const KINDS: { id: Kind; label: string; filename: string }[] = [
  { id: "claude", label: "CLAUDE.md", filename: "CLAUDE.md" },
  { id: "agents", label: "AGENTS.md", filename: "AGENTS.md" },
  { id: "gemini", label: "GEMINI.md", filename: "GEMINI.md" },
];

type MemoryFile = {
  path: string;
  exists: boolean;
  content: string | null;
  hash: string | null;
};

async function readMemoryFile(
  workspaceId: string,
  scope: Scope,
  file: Kind,
): Promise<MemoryFile> {
  return invoke<MemoryFile>("read_memory_file", {
    workspaceId,
    scope,
    file,
  });
}

async function saveMemoryFile(
  workspaceId: string,
  scope: Scope,
  file: Kind,
  newText: string,
  expectedHash: string | null,
): Promise<MemoryFile> {
  return invoke<MemoryFile>("save_memory_file", {
    workspaceId,
    scope,
    file,
    newText,
    expectedHash,
  });
}

type Props = { workspace: Workspace };

export function MemoryEditor({ workspace }: Props) {
  const [scope, setScope] = useState<Scope>("project");
  const [kind, setKind] = useState<Kind>("claude");
  const [file, setFile] = useState<MemoryFile | null>(null);
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [reloadNonce, setReloadNonce] = useState(0);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    readMemoryFile(workspace.id, scope, kind)
      .then((f) => {
        if (!active) return;
        setFile(f);
        setDraft(f.content ?? "");
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
  }, [workspace.id, scope, kind, reloadNonce]);

  const dirty = draft !== (file?.content ?? "");

  function revert() {
    setDraft(file?.content ?? "");
    setError(null);
  }

  async function save(force = false) {
    setSaving(true);
    setError(null);
    try {
      const result = await saveMemoryFile(
        workspace.id,
        scope,
        kind,
        draft,
        force ? null : (file?.hash ?? null),
      );
      setFile(result);
      setDraft(result.content ?? "");
      setSavedAt(Date.now());
    } catch (e) {
      setError(String(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-4 p-3 border border-default rounded surface">
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted">Scope:</span>
          {SCOPES.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => setScope(s.id)}
              className={cn(
                "px-2 py-1 rounded text-sm",
                scope === s.id
                  ? "bg-black/10 dark:bg-white/10"
                  : "hover:bg-black/5 dark:hover:bg-white/5",
              )}
            >
              {s.label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted">File:</span>
          {KINDS.map((k) => (
            <button
              key={k.id}
              type="button"
              onClick={() => setKind(k.id)}
              className={cn(
                "px-2 py-1 rounded text-sm font-mono",
                kind === k.id
                  ? "bg-black/10 dark:bg-white/10"
                  : "hover:bg-black/5 dark:hover:bg-white/5",
              )}
            >
              {k.label}
            </button>
          ))}
        </div>
        {file && (
          <span
            className="text-xs text-muted font-mono truncate ml-auto self-center"
            title={file.path}
          >
            {file.path}
          </span>
        )}
      </div>

      {loading && <p className="text-sm text-muted">Loading file…</p>}
      {!loading && file && !file.exists && (
        <div className="text-sm text-muted border border-dashed border-default rounded p-3">
          This file does not exist yet. Saving will create it at{" "}
          <span className="font-mono">{file.path}</span>.
        </div>
      )}

      {!loading && (
        <>
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder={
              file?.exists
                ? ""
                : "# Project memory\n\nWrite instructions Claude Code should always see for this scope."
            }
            spellCheck={false}
            className="w-full min-h-[40vh] bg-transparent border border-default rounded p-3 text-sm font-mono resize-y"
          />

          <SaveControls
            dirty={dirty}
            saving={saving}
            savedAt={savedAt}
            saveLabel={file?.exists ? "Save" : "Create file"}
            error={error}
            onSave={() => save(false)}
            onForceSave={() => save(true)}
            onDiscard={revert}
          />

          <BackupsList
            fetchBackups={() =>
              invoke<BackupEntry[]>("list_backups_for_memory", {
                workspaceId: workspace.id,
                scope,
                file: kind,
              })
            }
            currentHash={file?.hash ?? null}
            onRestored={async () => {
              setReloadNonce((n) => n + 1);
            }}
          />
        </>
      )}
    </div>
  );
}
