import { invoke } from "@tauri-apps/api/core";
import { useEffect, useState } from "react";
import { cn } from "../lib/cn";
import type { Workspace } from "../types";
import { BackupsList, type BackupEntry } from "./BackupsList";
import { SaveControls } from "./SaveControls";
import { Card, HelpNote, Textarea } from "./ui";

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
    <div className="space-y-6">
      <Card variant="cream" className="p-5 space-y-3">
        <div className="flex flex-wrap items-center gap-4">
          <PillGroup
            label="Scope"
            value={scope}
            options={SCOPES.map((s) => ({ value: s.id, label: s.label }))}
            onChange={(v) => setScope(v)}
          />
          <PillGroup
            label="File"
            value={kind}
            options={KINDS.map((k) => ({
              value: k.id,
              label: k.label,
              mono: true,
            }))}
            onChange={(v) => setKind(v)}
          />
        </div>
        {file && (
          <p
            className="font-mono text-[11px] text-muted truncate"
            title={file.path}
          >
            {file.path}
          </p>
        )}
      </Card>

      <Card variant="cream" className="p-5">
        <HelpNote>
          Claude Code loads these markdown files into its context every turn
          for this scope. Use them for durable instructions, repo conventions,
          or project-specific glossary — things you&apos;d otherwise paste into
          every prompt. <code className="font-mono">CLAUDE.md</code> is the
          primary file;{" "}
          <code className="font-mono">AGENTS.md</code> /{" "}
          <code className="font-mono">GEMINI.md</code> are cross-tool
          equivalents for compatibility with other assistants.
        </HelpNote>
      </Card>

      {loading && (
        <p className="font-body text-sm text-muted">Loading file…</p>
      )}
      {!loading && file && !file.exists && (
        <Card
          variant="soft"
          className="border-l-[3px] border-accent p-4"
        >
          <p className="font-body text-sm text-body">
            This file does not exist yet. Saving will create it at{" "}
            <span className="font-mono text-ink">{file.path}</span>.
          </p>
        </Card>
      )}

      {!loading && (
        <>
          <Textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder={
              file?.exists
                ? ""
                : "# Project memory\n\nWrite instructions Claude Code should always see for this scope."
            }
            spellCheck={false}
            className="min-h-[40vh] font-mono resize-y"
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

function PillGroup<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: { value: T; label: string; mono?: boolean }[];
  onChange: (v: T) => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="font-body text-xs text-muted">{label}:</span>
      <div className="flex gap-1.5">
        {options.map((o) => {
          const selected = value === o.value;
          return (
            <button
              key={o.value}
              type="button"
              onClick={() => onChange(o.value)}
              className={cn(
                "rounded-full px-3.5 py-1.5 text-xs transition-colors",
                "focus:outline-none focus-visible:shadow-focus-ink",
                o.mono ? "font-mono" : "font-sans",
                selected
                  ? "bg-inverse text-on-inverse font-semibold"
                  : "bg-card border border-hairline text-ink font-medium hover:bg-canvas",
              )}
            >
              {o.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
