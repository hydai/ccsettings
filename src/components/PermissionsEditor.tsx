import { invoke } from "@tauri-apps/api/core";
import { useEffect, useState } from "react";
import { cn } from "../lib/cn";
import { TIER_LABEL } from "../lib/layers";
import {
  getLayerContent,
  saveLayer,
  type LayerFile,
} from "../state/layerContent";
import { useCascade } from "../state/cascade";
import type { LayerKind, Workspace } from "../types";
import { BackupsList, type BackupEntry } from "./BackupsList";
import { SaveControls } from "./SaveControls";
import { TierPicker } from "./TierPicker";

type Kind = "allow" | "deny" | "ask";
const KINDS: Kind[] = ["allow", "deny", "ask"];

type Lists = Record<Kind, string[]>;

function emptyLists(): Lists {
  return { allow: [], deny: [], ask: [] };
}

function listsFromLayer(layer: LayerFile | null): Lists {
  const perms = (layer?.content as Record<string, unknown> | null)?.permissions;
  const p = (perms as Record<string, unknown> | undefined) ?? {};
  const arr = (v: unknown): string[] =>
    Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
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
    if (draft[k].length > 0) perms[k] = draft[k];
    else delete perms[k];
  }
  const out = { ...base };
  if (Object.keys(perms).length > 0) out.permissions = perms;
  else delete out.permissions;
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
  }, [workspace.id, target, reloadNonce]);

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
        name="permissions-tier"
      />

      {loading && <p className="text-sm text-muted">Loading tier…</p>}
      {layerFile?.parse_error && (
        <div className="border border-red-500/30 bg-red-500/5 rounded p-3 text-sm text-red-500">
          This tier's file could not be parsed: {layerFile.parse_error}.
          Editing is disabled until the file is fixed.
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

          <SaveControls
            dirty={dirty}
            saving={saving}
            savedAt={savedAt}
            saveLabel={`Save to ${TIER_LABEL[target]}`}
            error={error}
            onSave={save}
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
