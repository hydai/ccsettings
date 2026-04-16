import { useEffect, useState } from "react";
import { cn } from "../lib/cn";
import {
  getLayerContent,
  saveLayer,
  type LayerFile,
} from "../state/layerContent";
import { useCascade } from "../state/cascade";
import type { LayerKind, Workspace } from "../types";

type Kind = "allow" | "deny" | "ask";
const KINDS: Kind[] = ["allow", "deny", "ask"];

// Writable tiers (managed is read-only for v1).
const WRITABLE_TIERS: LayerKind[] = [
  "user",
  "user-local",
  "project",
  "project-local",
];

const TIER_LABEL: Record<LayerKind, string> = {
  managed: "Managed",
  user: "User",
  "user-local": "User Local",
  project: "Project",
  "project-local": "Project Local",
};

const TIER_DOT: Record<LayerKind, string> = {
  managed: "bg-layer-managed",
  user: "bg-layer-user",
  "user-local": "bg-layer-user-local",
  project: "bg-layer-project",
  "project-local": "bg-layer-project-local",
};

type Lists = Record<Kind, string[]>;

function emptyLists(): Lists {
  return { allow: [], deny: [], ask: [] };
}

function listsFromLayer(layer: LayerFile | null): Lists {
  const perms = (layer?.content as Record<string, unknown> | null)?.permissions;
  const p = (perms as Record<string, unknown> | undefined) ?? {};
  const arr = (v: unknown): string[] =>
    Array.isArray(v) ? v.filter((x) => typeof x === "string") : [];
  return {
    allow: arr(p.allow),
    deny: arr(p.deny),
    ask: arr(p.ask),
  };
}

function buildNewValue(original: LayerFile | null, draft: Lists): unknown {
  const base = (original?.content as Record<string, unknown>) ?? {};
  const perms: Record<string, unknown> = {
    ...(base.permissions as Record<string, unknown> | undefined),
  };
  for (const k of KINDS) {
    if (draft[k].length > 0) {
      perms[k] = draft[k];
    } else {
      delete perms[k];
    }
  }
  const out = { ...base };
  if (Object.keys(perms).length > 0) {
    out.permissions = perms;
  } else {
    delete out.permissions;
  }
  return out;
}

type Props = { workspace: Workspace };

export function PermissionsEditor({ workspace }: Props) {
  const [target, setTarget] = useState<LayerKind>("project-local");
  const [layerFile, setLayerFile] = useState<LayerFile | null>(null);
  const [draft, setDraft] = useState<Lists>(emptyLists);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [newKind, setNewKind] = useState<Kind>("allow");
  const [newRule, setNewRule] = useState("");

  const cascadeLoad = useCascade((s) => s.load);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    getLayerContent(workspace.id, target)
      .then((lf) => {
        if (!active) return;
        setLayerFile(lf);
        setDraft(listsFromLayer(lf));
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
    JSON.stringify(draft) !== JSON.stringify(listsFromLayer(layerFile));

  function addRule(e: React.FormEvent) {
    e.preventDefault();
    const rule = newRule.trim();
    if (!rule) return;
    setDraft((d) => {
      if (d[newKind].includes(rule)) return d;
      return { ...d, [newKind]: [...d[newKind], rule] };
    });
    setNewRule("");
  }

  function removeRule(kind: Kind, idx: number) {
    setDraft((d) => ({ ...d, [kind]: d[kind].filter((_, i) => i !== idx) }));
  }

  function revert() {
    setDraft(listsFromLayer(layerFile));
    setError(null);
  }

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const newValue = buildNewValue(layerFile, draft);
      const result = await saveLayer({
        workspaceId: workspace.id,
        layer: target,
        newValue,
        expectedHash: layerFile?.hash ?? null,
      });
      setLayerFile(result);
      setDraft(listsFromLayer(result));
      setSavedAt(Date.now());
      // Refresh the cascade so the header and overview reflect the change.
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
      <div className="flex flex-wrap items-center gap-3 p-3 border border-default rounded surface">
        <span className="text-sm text-muted">Write to:</span>
        {WRITABLE_TIERS.map((t) => (
          <label
            key={t}
            className={cn(
              "flex items-center gap-1.5 px-2 py-1 rounded cursor-pointer text-sm",
              target === t
                ? "bg-black/10 dark:bg-white/10"
                : "hover:bg-black/5 dark:hover:bg-white/5",
            )}
          >
            <input
              type="radio"
              name="target-tier"
              checked={target === t}
              onChange={() => setTarget(t)}
              className="sr-only"
            />
            <span className={cn("w-2 h-2 rounded-full", TIER_DOT[t])} />
            <span>{TIER_LABEL[t]}</span>
          </label>
        ))}
        {layerFile && (
          <span
            className="text-xs text-muted font-mono truncate ml-auto"
            title={layerFile.path}
          >
            {layerFile.path}
          </span>
        )}
      </div>

      {loading && <p className="text-sm text-muted">Loading tier…</p>}
      {layerFile?.parse_error && (
        <div className="border border-red-500/30 bg-red-500/5 rounded p-3 text-sm text-red-500">
          This tier's file could not be parsed: {layerFile.parse_error}. Editing is
          disabled until the file is fixed.
        </div>
      )}

      {!loading && !layerFile?.parse_error && (
        <>
          {KINDS.map((kind) => (
            <RuleList
              key={kind}
              kind={kind}
              rules={draft[kind]}
              onRemove={(idx) => removeRule(kind, idx)}
            />
          ))}

          <form
            onSubmit={addRule}
            className="flex gap-2 items-center p-3 border border-default rounded surface"
          >
            <select
              value={newKind}
              onChange={(e) => setNewKind(e.target.value as Kind)}
              className="bg-transparent border border-default rounded px-2 py-1 text-sm"
            >
              {KINDS.map((k) => (
                <option key={k} value={k}>
                  {k}
                </option>
              ))}
            </select>
            <input
              type="text"
              value={newRule}
              onChange={(e) => setNewRule(e.target.value)}
              placeholder="Bash(git *) or mcp__pencil or WebFetch(*)"
              className="flex-1 bg-transparent border border-default rounded px-3 py-1 text-sm font-mono"
            />
            <button
              type="submit"
              disabled={!newRule.trim()}
              className={cn(
                "px-3 py-1 rounded text-sm border border-default",
                !newRule.trim()
                  ? "opacity-40 cursor-not-allowed"
                  : "hover:bg-black/5 dark:hover:bg-white/5",
              )}
            >
              Add
            </button>
          </form>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={save}
              disabled={!dirty || saving}
              className={cn(
                "px-4 py-2 rounded text-sm font-medium",
                dirty && !saving
                  ? "bg-blue-600 text-white hover:bg-blue-700"
                  : "bg-black/10 dark:bg-white/10 text-muted cursor-not-allowed",
              )}
            >
              {saving ? "Saving…" : `Save to ${TIER_LABEL[target]}`}
            </button>
            <button
              type="button"
              onClick={revert}
              disabled={!dirty || saving}
              className={cn(
                "px-4 py-2 rounded text-sm border border-default",
                dirty && !saving
                  ? "hover:bg-black/5 dark:hover:bg-white/5"
                  : "opacity-40 cursor-not-allowed",
              )}
            >
              Discard changes
            </button>
            {savedAt && !dirty && !saving && (
              <span className="text-xs text-muted">
                Saved at {new Date(savedAt).toLocaleTimeString()}
              </span>
            )}
          </div>

          {error && (
            <div className="border border-red-500/30 bg-red-500/5 rounded p-3 text-sm text-red-500">
              {error.startsWith("conflict:") ? (
                <>
                  <strong>Conflict:</strong> the file changed on disk while you
                  were editing. Click <em>Discard changes</em> to pull the
                  latest, or copy your edits elsewhere before reloading.
                </>
              ) : (
                error
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function RuleList({
  kind,
  rules,
  onRemove,
}: {
  kind: Kind;
  rules: string[];
  onRemove: (idx: number) => void;
}) {
  return (
    <section>
      <div className="flex items-baseline justify-between mb-2">
        <h3 className="text-xs font-medium uppercase tracking-wider text-muted">
          {kind}
        </h3>
        <span className="text-xs text-muted">{rules.length}</span>
      </div>
      {rules.length === 0 ? (
        <div className="text-xs text-muted italic px-3 py-2 border border-dashed border-default rounded">
          empty
        </div>
      ) : (
        <ul className="space-y-1">
          {rules.map((rule, i) => (
            <li
              key={`${rule}-${i}`}
              className="flex items-center gap-2 px-3 py-1.5 border border-default rounded surface"
            >
              <span className="flex-1 text-sm font-mono truncate" title={rule}>
                {rule}
              </span>
              <button
                type="button"
                onClick={() => onRemove(i)}
                aria-label={`Remove ${rule}`}
                className="w-6 h-6 flex items-center justify-center rounded hover:bg-red-500/10 text-muted hover:text-red-500"
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
