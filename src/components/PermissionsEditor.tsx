import { invoke } from "@tauri-apps/api/core";
import { X } from "lucide-react";
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
import { Button, Card, HelpNote, Input, SectionLabel } from "./ui";

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

  async function save(force = false) {
    setSaving(true);
    setError(null);
    try {
      const newValue = buildNewValue(layerFile, draft);
      const result = await saveLayer({
        workspaceId: workspace.id,
        layer: target,
        newValue,
        expectedHash: force ? null : (layerFile?.hash ?? null),
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
            Editing is disabled until the file is fixed.
          </p>
        </Card>
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

          <Card variant="cream" className="p-5 space-y-3">
            <SectionLabel>Add rule</SectionLabel>
            <form
              onSubmit={addRule}
              className="flex gap-2 items-center"
            >
              <select
                value={newKind}
                onChange={(e) => setNewKind(e.target.value as Kind)}
                className={cn(
                  "bg-card border border-hairline rounded-soft-sm px-3 py-3.5 text-sm font-sans text-ink",
                  "focus:outline-none focus:border-[1.5px] focus:border-ink focus:shadow-focus-ink",
                )}
              >
                {KINDS.map((k) => (
                  <option key={k} value={k}>
                    {k}
                  </option>
                ))}
              </select>
              <Input
                type="text"
                value={newRule}
                onChange={(e) => setNewRule(e.target.value)}
                placeholder="Bash(git *) or mcp__pencil or WebFetch(*)"
                className="flex-1 font-mono"
              />
              <Button
                type="submit"
                variant="primary"
                disabled={!newRule.trim()}
              >
                Add
              </Button>
            </form>
            <HelpNote>
              Syntax: <code className="font-mono">Tool(args)</code> where Tool
              is a built-in (<code className="font-mono">Bash</code>,{" "}
              <code className="font-mono">Read</code>,{" "}
              <code className="font-mono">Edit</code>,{" "}
              <code className="font-mono">Write</code>,{" "}
              <code className="font-mono">WebFetch</code>, …) or an MCP (
              <code className="font-mono">mcp__&lt;name&gt;</code>).{" "}
              <code className="font-mono">*</code> matches any args.{" "}
              <code className="font-mono">allow</code> skips the prompt;{" "}
              <code className="font-mono">deny</code> refuses unconditionally
              (union across all tiers — fail-closed);{" "}
              <code className="font-mono">ask</code> always prompts.
            </HelpNote>
          </Card>

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
        <SectionLabel>{kind}</SectionLabel>
        <span className="font-body text-xs text-muted">{rules.length}</span>
      </div>
      {rules.length === 0 ? (
        <Card variant="soft" className="p-4 text-center">
          <span className="font-body text-xs text-muted italic">empty</span>
        </Card>
      ) : (
        <Card variant="soft" className="overflow-hidden">
          <ul className="divide-y divide-hairline">
            {rules.map((rule, i) => (
              <li
                key={`${rule}-${i}`}
                className="flex items-center gap-2 px-4 py-2.5"
              >
                <span
                  className="flex-1 font-mono text-sm text-ink truncate"
                  title={rule}
                >
                  {rule}
                </span>
                <button
                  type="button"
                  onClick={() => onRemove(i)}
                  aria-label={`Remove ${rule}`}
                  className="w-7 h-7 flex items-center justify-center rounded-full text-muted hover:bg-danger-soft/10 hover:text-danger-soft transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </section>
  );
}
