import { AlertTriangle, Plus } from "lucide-react";
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
import { SaveControls } from "./SaveControls";
import { TierPicker } from "./TierPicker";

const KNOWN_EVENTS = [
  "PreToolUse",
  "PostToolUse",
  "UserPromptSubmit",
  "Notification",
  "Stop",
  "SubagentStop",
  "SessionStart",
  "SessionEnd",
  "PreCompact",
] as const;

/** Patterns that warrant a visible warning — not a block. */
const DANGER_PATTERNS: { pattern: RegExp; label: string }[] = [
  { pattern: /\brm\s+(-[a-zA-Z]*[rRf][a-zA-Z]*|--recursive|--force)/, label: "recursive/force rm" },
  { pattern: /curl[^|]*\|\s*(sh|bash|zsh)\b/i, label: "curl piped to shell" },
  { pattern: /wget[^|]*\|\s*(sh|bash|zsh)\b/i, label: "wget piped to shell" },
  { pattern: /\bsudo\b/, label: "sudo" },
  { pattern: /:\s*\(\s*\)\s*{.*};\s*:/, label: "fork bomb-like pattern" },
  { pattern: /\bmkfs\b|\bdd\s+if=|\bshred\b/, label: "filesystem-destructive command" },
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

/** Group flat hooks back into the nested settings shape, preserving the row
 *  order within each (event, matcher) pair. */
function buildNewValue(original: LayerFile | null, rows: Hook[]): unknown {
  const base = {
    ...((original?.content as Record<string, unknown>) ?? {}),
  };

  const byEvent: Record<string, Array<{ matcher: string; commands: string[] }>> =
    {};
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
  }, [workspace.id, target]);

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

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const newValue = buildNewValue(layerFile, rows);
      const result = await saveLayer({
        workspaceId: workspace.id,
        layer: target,
        newValue,
        expectedHash: layerFile?.hash ?? null,
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
    <div className="space-y-4">
      <TierPicker
        value={target}
        onChange={setTarget}
        currentPath={layerFile?.path ?? null}
        name="hooks-tier"
      />

      {loading && <p className="text-sm text-muted">Loading tier…</p>}
      {layerFile?.parse_error && (
        <div className="border border-red-500/30 bg-red-500/5 rounded p-3 text-sm text-red-500">
          This tier's file could not be parsed: {layerFile.parse_error}.
        </div>
      )}

      {!loading && !layerFile?.parse_error && (
        <>
          <p className="text-xs text-muted">
            Hooks run when Claude Code hits the matching event. Commands at the
            same <code>event</code>+<code>matcher</code> are grouped on save.
          </p>

          {rows.length === 0 ? (
            <div className="text-xs text-muted italic px-3 py-2 border border-dashed border-default rounded">
              no hooks at this tier
            </div>
          ) : (
            <ul className="space-y-2">
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

          <button
            type="button"
            onClick={addRow}
            className={cn(
              "flex items-center gap-2 px-3 py-1.5 rounded text-sm border border-dashed border-default",
              "hover:bg-black/5 dark:hover:bg-white/5",
            )}
          >
            <Plus className="w-4 h-4" />
            Add hook
          </button>

          <SaveControls
            dirty={dirty}
            saving={saving}
            savedAt={savedAt}
            saveLabel={`Save to ${TIER_LABEL[target]}`}
            error={error}
            onSave={save}
            onDiscard={revert}
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
    <li className="p-3 border border-default rounded surface">
      <div className="flex gap-2 mb-2">
        <input
          type="text"
          list="hook-events"
          value={hook.event}
          onChange={(e) => onChange("event", e.target.value)}
          placeholder="PreToolUse"
          className="w-40 bg-transparent border border-default rounded px-2 py-1 text-sm font-mono"
        />
        <datalist id="hook-events">
          {KNOWN_EVENTS.map((e) => (
            <option key={e} value={e} />
          ))}
        </datalist>
        <input
          type="text"
          value={hook.matcher}
          onChange={(e) => onChange("matcher", e.target.value)}
          placeholder="matcher (e.g. Bash, Write|Edit)"
          className="flex-1 bg-transparent border border-default rounded px-2 py-1 text-sm font-mono"
        />
        <button
          type="button"
          onClick={onRemove}
          aria-label="Remove hook"
          className="w-8 h-8 flex items-center justify-center rounded hover:bg-red-500/10 text-muted hover:text-red-500"
        >
          ×
        </button>
      </div>
      <textarea
        value={hook.command}
        onChange={(e) => onChange("command", e.target.value)}
        placeholder='shell command, e.g.  if echo "$TOOL_INPUT" | grep -q "rm -rf"; then ...'
        spellCheck={false}
        rows={Math.min(8, Math.max(2, hook.command.split("\n").length))}
        className="w-full bg-transparent border border-default rounded px-2 py-1 text-sm font-mono resize-y"
      />
      {flags.length > 0 && (
        <div className="flex items-start gap-2 mt-2 text-xs text-amber-600 dark:text-amber-400">
          <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
          <div>
            <span className="font-medium">Heads up:</span> command contains{" "}
            {flags.join(", ")}. Make sure this is intentional.
          </div>
        </div>
      )}
    </li>
  );
}
