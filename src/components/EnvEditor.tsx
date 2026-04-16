import { invoke } from "@tauri-apps/api/core";
import { Eye, EyeOff, Plus, X } from "lucide-react";
import { useEffect, useState } from "react";
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
import { Button, Card, HelpNote, Input, SectionLabel } from "./ui";

type Entry = { key: string; value: string };

const SECRET_PATTERN = /(TOKEN|KEY|SECRET|PASSWORD|API)/i;

export function isSecretKey(k: string): boolean {
  return SECRET_PATTERN.test(k);
}

function entriesFromLayer(layer: LayerFile | null): Entry[] {
  const env = (layer?.content as Record<string, unknown> | null)?.env;
  if (!env || typeof env !== "object") return [];
  return Object.entries(env as Record<string, unknown>)
    .filter(
      ([, v]) =>
        typeof v === "string" ||
        typeof v === "number" ||
        typeof v === "boolean",
    )
    .map(([key, v]) => ({ key, value: String(v) }));
}

function buildNewValue(
  original: LayerFile | null,
  entries: Entry[],
): unknown {
  const base = (original?.content as Record<string, unknown>) ?? {};
  const env: Record<string, string> = {};
  for (const { key, value } of entries) {
    const k = key.trim();
    if (!k) continue;
    env[k] = value;
  }
  const out = { ...base };
  if (Object.keys(env).length > 0) {
    out.env = env;
  } else {
    delete out.env;
  }
  return out;
}

type Props = { workspace: Workspace };

export function EnvEditor({ workspace }: Props) {
  const [target, setTarget] = useState<LayerKind>("project-local");
  const [layerFile, setLayerFile] = useState<LayerFile | null>(null);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [revealed, setRevealed] = useState<Set<number>>(() => new Set());
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
        setEntries(entriesFromLayer(lf));
        setRevealed(new Set());
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
    JSON.stringify(entries) !== JSON.stringify(entriesFromLayer(layerFile));

  const willCommitSecretToProjectTier =
    target === "project" && entries.some((e) => isSecretKey(e.key));

  function updateKey(idx: number, key: string) {
    setEntries((es) => es.map((e, i) => (i === idx ? { ...e, key } : e)));
  }

  function updateValue(idx: number, value: string) {
    setEntries((es) => es.map((e, i) => (i === idx ? { ...e, value } : e)));
  }

  function addRow() {
    setEntries((es) => [...es, { key: "", value: "" }]);
  }

  function removeRow(idx: number) {
    setEntries((es) => es.filter((_, i) => i !== idx));
    setRevealed((r) => {
      const next = new Set<number>();
      for (const i of r) {
        if (i < idx) next.add(i);
        else if (i > idx) next.add(i - 1);
      }
      return next;
    });
  }

  function toggleReveal(idx: number) {
    setRevealed((r) => {
      const next = new Set(r);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  }

  function revert() {
    setEntries(entriesFromLayer(layerFile));
    setRevealed(new Set());
    setError(null);
  }

  async function save(force = false) {
    const seen = new Set<string>();
    for (const e of entries) {
      const k = e.key.trim();
      if (!k) continue;
      if (seen.has(k)) {
        setError(
          `duplicate key "${k}" — each env variable can only appear once`,
        );
        return;
      }
      seen.add(k);
    }
    setSaving(true);
    setError(null);
    try {
      const newValue = buildNewValue(layerFile, entries);
      const result = await saveLayer({
        workspaceId: workspace.id,
        layer: target,
        newValue,
        expectedHash: force ? null : (layerFile?.hash ?? null),
      });
      setLayerFile(result);
      setEntries(entriesFromLayer(result));
      setRevealed(new Set());
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
        name="env-tier"
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
          <Card variant="cream" className="p-5">
            <HelpNote>
              These variables are injected into Claude Code&apos;s shell tool
              calls and a few internal flags. Examples:{" "}
              <code className="font-mono">
                CLAUDE_CODE_SUBAGENT_MODEL=opus
              </code>{" "}
              (override the model used by subagents),{" "}
              <code className="font-mono">ANTHROPIC_API_KEY=…</code> (override
              auth),{" "}
              <code className="font-mono">EDITOR=code</code> (hook scripts see
              it). Keys matching{" "}
              <code className="font-mono">
                TOKEN | KEY | SECRET | PASSWORD | API
              </code>{" "}
              are masked by default.
            </HelpNote>
          </Card>

          {willCommitSecretToProjectTier && (
            <Card
              variant="soft"
              className="border-l-[3px] border-amber-500 dark:border-amber-400 p-4"
            >
              <p className="font-body text-sm text-body">
                <strong className="font-semibold text-ink">Heads up:</strong>{" "}
                the Project tier is typically committed to git. Secrets (keys
                matching{" "}
                <code className="font-mono">
                  TOKEN|KEY|SECRET|PASSWORD|API
                </code>
                ) should live in Project Local or User Local instead.
              </p>
            </Card>
          )}

          <section>
            <div className="flex items-baseline justify-between mb-2">
              <SectionLabel>Environment variables</SectionLabel>
              <span className="font-body text-xs text-muted">
                {entries.length}
              </span>
            </div>
            {entries.length === 0 ? (
              <Card variant="soft" className="p-4 text-center">
                <span className="font-body text-xs text-muted italic">
                  no variables at this tier
                </span>
              </Card>
            ) : (
              <Card variant="soft" className="overflow-hidden">
                <ul className="divide-y divide-hairline">
                  {entries.map((entry, i) => {
                    const secret = isSecretKey(entry.key);
                    const shouldMask = secret && !revealed.has(i);
                    return (
                      <li
                        key={i}
                        className="flex items-center gap-3 px-4 py-3"
                      >
                        <Input
                          type="text"
                          value={entry.key}
                          onChange={(e) => updateKey(i, e.target.value)}
                          placeholder="KEY"
                          className="w-56 font-mono !py-2.5"
                        />
                        <span className="font-mono text-muted text-sm">=</span>
                        <Input
                          type={shouldMask ? "password" : "text"}
                          value={entry.value}
                          onChange={(e) => updateValue(i, e.target.value)}
                          placeholder="value"
                          className="flex-1 font-mono !py-2.5"
                        />
                        {secret && (
                          <button
                            type="button"
                            onClick={() => toggleReveal(i)}
                            aria-label={
                              revealed.has(i) ? "Hide value" : "Reveal value"
                            }
                            className="w-8 h-8 flex items-center justify-center rounded-full text-muted hover:bg-canvas hover:text-ink transition-colors"
                            title={
                              revealed.has(i)
                                ? "Hide (unmasked while you edit)"
                                : "Value is masked because the key looks like a secret"
                            }
                          >
                            {revealed.has(i) ? (
                              <EyeOff className="w-4 h-4" />
                            ) : (
                              <Eye className="w-4 h-4" />
                            )}
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => removeRow(i)}
                          aria-label={`Remove ${entry.key || "entry"}`}
                          className="w-8 h-8 flex items-center justify-center rounded-full text-muted hover:bg-danger-soft/10 hover:text-danger-soft transition-colors"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </Card>
            )}

            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={addRow}
              className="mt-3"
            >
              <Plus className="w-3.5 h-3.5" />
              Add variable
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
