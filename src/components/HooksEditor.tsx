import { invoke } from "@tauri-apps/api/core";
import { AlertTriangle, Plus, X } from "lucide-react";
import { useEffect, useState } from "react";
import { cn } from "../lib/cn";
import { TIER_LABEL } from "../lib/layers";
import { useCascade } from "../state/cascade";
import {
  getLayerContent,
  saveLayer,
  type LayerFile,
} from "../state/layerContent";
import type { LayerKind, Workspace } from "../types";
import { BackupsList, type BackupEntry } from "./BackupsList";
import { SaveControls } from "./SaveControls";
import { TierPicker } from "./TierPicker";
import { Button, Card, HelpNote, Input, SectionLabel, Textarea } from "./ui";

/** All built-in Claude Code hook events, ordered roughly by lifecycle
 *  (session → prompt → tool → response → environment → compaction).
 *  Sourced from https://code.claude.com/docs/en/hooks. */
const KNOWN_EVENTS = [
  "SessionStart",
  "UserPromptSubmit",
  "PreToolUse",
  "PermissionRequest",
  "PermissionDenied",
  "PostToolUse",
  "PostToolUseFailure",
  "Notification",
  "Elicitation",
  "ElicitationResult",
  "SubagentStart",
  "SubagentStop",
  "TaskCreated",
  "TaskCompleted",
  "TeammateIdle",
  "Stop",
  "StopFailure",
  "InstructionsLoaded",
  "ConfigChange",
  "CwdChanged",
  "FileChanged",
  "WorktreeCreate",
  "WorktreeRemove",
  "PreCompact",
  "PostCompact",
  "SessionEnd",
] as const;

/** Patterns that warrant a visible warning — not a block. */
const DANGER_PATTERNS: { pattern: RegExp; label: string }[] = [
  {
    pattern: /\brm\s+(-[a-zA-Z]*[rRf][a-zA-Z]*|--recursive|--force)/,
    label: "recursive/force rm",
  },
  { pattern: /curl[^|]*\|\s*(sh|bash|zsh)\b/i, label: "curl piped to shell" },
  { pattern: /wget[^|]*\|\s*(sh|bash|zsh)\b/i, label: "wget piped to shell" },
  { pattern: /\bsudo\b/, label: "sudo" },
  { pattern: /:\s*\(\s*\)\s*{.*};\s*:/, label: "fork bomb-like pattern" },
  {
    pattern: /\bmkfs\b|\bdd\s+if=|\bshred\b/,
    label: "filesystem-destructive command",
  },
];

type Hook = {
  id: string;
  event: string;
  matcher: string;
  command: string;
};

let nextId = 0;
const mkId = () => `h${++nextId}`;

function hooksFromLayer(layer: LayerFile | null): Hook[] {
  const h = (layer?.content as Record<string, unknown> | null)?.hooks;
  if (!h || typeof h !== "object") return [];
  const out: Hook[] = [];
  for (const [event, groups] of Object.entries(h as Record<string, unknown>)) {
    if (!Array.isArray(groups)) continue;
    for (const g of groups) {
      if (!g || typeof g !== "object") continue;
      const matcher =
        typeof (g as Record<string, unknown>).matcher === "string"
          ? ((g as Record<string, unknown>).matcher as string)
          : "";
      const commands = (g as Record<string, unknown>).hooks;
      if (!Array.isArray(commands)) continue;
      for (const c of commands) {
        if (!c || typeof c !== "object") continue;
        const rec = c as Record<string, unknown>;
        if (rec.type !== "command") continue;
        const command = typeof rec.command === "string" ? rec.command : "";
        out.push({ id: mkId(), event, matcher, command });
      }
    }
  }
  return out;
}

/** Group flat hooks back into the nested settings shape, preserving row
 *  order within each (event, matcher) pair. */
function buildNewValue(original: LayerFile | null, rows: Hook[]): unknown {
  const base = {
    ...((original?.content as Record<string, unknown>) ?? {}),
  };

  const byEvent: Record<
    string,
    Array<{ matcher: string; commands: string[] }>
  > = {};
  for (const row of rows) {
    const event = row.event.trim();
    if (!event) continue;
    if (!row.command.trim()) continue;
    const groupsForEvent = (byEvent[event] ||= []);
    const existing = groupsForEvent.find((g) => g.matcher === row.matcher);
    if (existing) {
      existing.commands.push(row.command);
    } else {
      groupsForEvent.push({ matcher: row.matcher, commands: [row.command] });
    }
  }

  const hooks: Record<string, unknown> = {};
  for (const [event, groups] of Object.entries(byEvent)) {
    hooks[event] = groups.map((g) => ({
      matcher: g.matcher,
      hooks: g.commands.map((c) => ({ type: "command", command: c })),
    }));
  }

  if (Object.keys(hooks).length > 0) base.hooks = hooks;
  else delete base.hooks;
  return base;
}

function dangerFlags(cmd: string): string[] {
  return DANGER_PATTERNS.filter((d) => d.pattern.test(cmd)).map((d) => d.label);
}

type Props = { workspace: Workspace };

export function HooksEditor({ workspace }: Props) {
  const [target, setTarget] = useState<LayerKind>("project-local");
  const [layerFile, setLayerFile] = useState<LayerFile | null>(null);
  const [rows, setRows] = useState<Hook[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [reloadNonce, setReloadNonce] = useState(0);

  const cascadeLoad = useCascade((s) => s.load);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    getLayerContent(workspace.id, target)
      .then((lf) => {
        if (!active) return;
        setLayerFile(lf);
        setRows(hooksFromLayer(lf));
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
  }, [workspace.id, target, reloadNonce]);

  const dirty =
    JSON.stringify(rows.map(stripId)) !==
    JSON.stringify(hooksFromLayer(layerFile).map(stripId));

  function updateRow<K extends keyof Hook>(id: string, key: K, value: Hook[K]) {
    setRows((rs) => rs.map((r) => (r.id === id ? { ...r, [key]: value } : r)));
  }

  function removeRow(id: string) {
    setRows((rs) => rs.filter((r) => r.id !== id));
  }

  function addRow() {
    setRows((rs) => [
      ...rs,
      { id: mkId(), event: "PreToolUse", matcher: "", command: "" },
    ]);
  }

  function revert() {
    setRows(hooksFromLayer(layerFile));
    setError(null);
  }

  async function save(force = false) {
    setSaving(true);
    setError(null);
    try {
      const newValue = buildNewValue(layerFile, rows);
      const result = await saveLayer({
        workspaceId: workspace.id,
        layer: target,
        newValue,
        expectedHash: force ? null : (layerFile?.hash ?? null),
      });
      setLayerFile(result);
      setRows(hooksFromLayer(result));
      setSavedAt(Date.now());
      useCascade.getState().invalidate();
      await cascadeLoad(workspace.id);
    } catch (e) {
      setError(String(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <TierPicker
        value={target}
        onChange={setTarget}
        currentPath={layerFile?.path ?? null}
        name="hooks-tier"
      />

      {loading && (
        <p className="font-body text-sm text-muted">Loading tier…</p>
      )}
      {layerFile?.parse_error && (
        <Card
          variant="soft"
          className="border-l-[3px] border-danger-soft p-4"
        >
          <p className="font-body text-sm text-danger-soft">
            This tier&apos;s file could not be parsed: {layerFile.parse_error}.
          </p>
        </Card>
      )}

      {!loading && !layerFile?.parse_error && (
        <>
          <Card variant="cream" className="p-5 space-y-2">
            <HelpNote>
              Hooks run when Claude Code hits a matching event. Commands at the
              same <code className="font-mono">event</code>+
              <code className="font-mono">matcher</code> are grouped on save.
            </HelpNote>
            <HelpNote>
              <strong className="font-semibold text-ink">Events:</strong> 26
              lifecycle hooks — session, prompt, tool call
              (pre/post/failure/permission), subagent, task, compaction, and
              filesystem/worktree watchers. The most common are{" "}
              <code className="font-mono">PreToolUse</code> (before a tool
              call, can block),{" "}
              <code className="font-mono">PostToolUse</code>, and{" "}
              <code className="font-mono">SessionStart</code>. Pick from the
              dropdown.
            </HelpNote>
            <HelpNote>
              <strong className="font-semibold text-ink">Matcher:</strong>{" "}
              tool name pattern, e.g. <code className="font-mono">Bash</code>,{" "}
              <code className="font-mono">Write|Edit</code>, or empty to match
              all tools.
            </HelpNote>
            <HelpNote>
              <strong className="font-semibold text-ink">Command:</strong>{" "}
              runs in <code className="font-mono">sh</code>. During{" "}
              <code className="font-mono">PreToolUse</code>/
              <code className="font-mono">PostToolUse</code>,{" "}
              <code className="font-mono">$TOOL_INPUT</code> holds the
              tool&apos;s JSON payload; a non-zero exit on{" "}
              <code className="font-mono">PreToolUse</code> blocks the call.
            </HelpNote>
          </Card>

          <section>
            <div className="flex items-baseline justify-between mb-2">
              <SectionLabel>Hooks</SectionLabel>
              <span className="font-body text-xs text-muted">{rows.length}</span>
            </div>
            {rows.length === 0 ? (
              <Card variant="soft" className="p-4 text-center">
                <span className="font-body text-xs text-muted italic">
                  no hooks at this tier
                </span>
              </Card>
            ) : (
              <ul className="space-y-3">
                {rows.map((row) => (
                  <HookRow
                    key={row.id}
                    hook={row}
                    onChange={(key, value) => updateRow(row.id, key, value)}
                    onRemove={() => removeRow(row.id)}
                  />
                ))}
              </ul>
            )}

            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={addRow}
              className="mt-3"
            >
              <Plus className="w-3.5 h-3.5" />
              Add hook
            </Button>
          </section>

          <SaveControls
            dirty={dirty}
            saving={saving}
            savedAt={savedAt}
            saveLabel={`Save to ${TIER_LABEL[target]}`}
            error={error}
            onSave={() => save(false)}
            onForceSave={() => save(true)}
            onDiscard={revert}
          />

          <BackupsList
            fetchBackups={() =>
              invoke<BackupEntry[]>("list_backups_for_layer", {
                workspaceId: workspace.id,
                layer: target,
              })
            }
            currentHash={layerFile?.hash ?? null}
            onRestored={async () => {
              setReloadNonce((n) => n + 1);
              useCascade.getState().invalidate();
              await cascadeLoad(workspace.id);
            }}
          />
        </>
      )}
    </div>
  );
}

function stripId(h: Hook): Omit<Hook, "id"> {
  const { event, matcher, command } = h;
  return { event, matcher, command };
}

function EventSelect({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  const isKnown = (KNOWN_EVENTS as readonly string[]).includes(value);
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={cn(
        "w-56 bg-card border border-hairline rounded-soft-sm px-3 py-2.5",
        "text-sm font-mono text-ink",
        "focus:outline-none focus:border-[1.5px] focus:border-ink focus:shadow-focus-ink",
      )}
    >
      {!isKnown && value && (
        <option value={value}>{value} (custom)</option>
      )}
      {KNOWN_EVENTS.map((e) => (
        <option key={e} value={e}>
          {e}
        </option>
      ))}
    </select>
  );
}

function HookRow({
  hook,
  onChange,
  onRemove,
}: {
  hook: Hook;
  onChange: <K extends keyof Hook>(key: K, value: Hook[K]) => void;
  onRemove: () => void;
}) {
  const flags = dangerFlags(hook.command);
  return (
    <li>
      <Card variant="soft" className="p-4 space-y-3">
        <div className="flex gap-2">
          <EventSelect
            value={hook.event}
            onChange={(v) => onChange("event", v)}
          />
          <Input
            type="text"
            value={hook.matcher}
            onChange={(e) => onChange("matcher", e.target.value)}
            placeholder="matcher (e.g. Bash, Write|Edit)"
            className="flex-1 font-mono !py-2.5"
          />
          <button
            type="button"
            onClick={onRemove}
            aria-label="Remove hook"
            className="w-9 h-9 flex-shrink-0 flex items-center justify-center rounded-full text-muted hover:bg-danger-soft/10 hover:text-danger-soft transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        <Textarea
          value={hook.command}
          onChange={(e) => onChange("command", e.target.value)}
          placeholder='shell command, e.g.  if echo "$TOOL_INPUT" | grep -q "rm -rf"; then ...'
          spellCheck={false}
          rows={Math.min(8, Math.max(2, hook.command.split("\n").length))}
          className="font-mono resize-y"
        />
        {flags.length > 0 && (
          <div className="flex items-start gap-2 rounded-soft-sm bg-amber-500/10 border border-amber-500/40 px-3 py-2">
            <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5 text-amber-600" />
            <p className="font-body text-xs text-body leading-[1.5]">
              <span className="font-semibold text-ink">Heads up:</span> command
              contains {flags.join(", ")}. Make sure this is intentional.
            </p>
          </div>
        )}
      </Card>
    </li>
  );
}
