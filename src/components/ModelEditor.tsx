import { invoke } from "@tauri-apps/api/core";
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
import { Card, HelpNote, Input, SectionLabel } from "./ui";

/** Fields the editor can set. `null` means "not set at this tier". */
type TierScalars = {
  model: string | null;
  outputStyle: string | null;
  effortLevel: string | null;
  alwaysThinkingEnabled: boolean | null;
  includeCoAuthoredBy: boolean | null;
};

const EFFORT_CHOICES = ["low", "medium", "high", "max"] as const;
const MODEL_SUGGESTIONS = [
  "opus",
  "sonnet",
  "haiku",
  "claude-opus-4-6",
  "claude-sonnet-4-6",
  "claude-haiku-4-5-20251001",
];
const OUTPUT_STYLE_SUGGESTIONS = [
  "default",
  "learning",
  "explanatory",
  "concise",
];

function emptyScalars(): TierScalars {
  return {
    model: null,
    outputStyle: null,
    effortLevel: null,
    alwaysThinkingEnabled: null,
    includeCoAuthoredBy: null,
  };
}

function scalarsFromLayer(layer: LayerFile | null): TierScalars {
  const c = layer?.content as Record<string, unknown> | null;
  if (!c) return emptyScalars();
  const str = (k: string) =>
    typeof c[k] === "string" ? (c[k] as string) : null;
  const bool = (k: string) =>
    typeof c[k] === "boolean" ? (c[k] as boolean) : null;
  return {
    model: str("model"),
    outputStyle: str("outputStyle"),
    effortLevel: str("effortLevel"),
    alwaysThinkingEnabled: bool("alwaysThinkingEnabled"),
    includeCoAuthoredBy: bool("includeCoAuthoredBy"),
  };
}

function buildNewValue(
  original: LayerFile | null,
  draft: TierScalars,
): unknown {
  const base = {
    ...((original?.content as Record<string, unknown>) ?? {}),
  };
  const assign = (key: keyof TierScalars) => {
    const v = draft[key];
    if (v === null) delete base[key];
    else base[key] = v as unknown;
  };
  assign("model");
  assign("outputStyle");
  assign("effortLevel");
  assign("alwaysThinkingEnabled");
  assign("includeCoAuthoredBy");
  return base;
}

type Props = { workspace: Workspace };

export function ModelEditor({ workspace }: Props) {
  const [target, setTarget] = useState<LayerKind>("project-local");
  const [layerFile, setLayerFile] = useState<LayerFile | null>(null);
  const [draft, setDraft] = useState<TierScalars>(emptyScalars);
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
        setDraft(scalarsFromLayer(lf));
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
    JSON.stringify(draft) !== JSON.stringify(scalarsFromLayer(layerFile));

  function update<K extends keyof TierScalars>(key: K, value: TierScalars[K]) {
    setDraft((d) => ({ ...d, [key]: value }));
  }

  function revert() {
    setDraft(scalarsFromLayer(layerFile));
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
      setDraft(scalarsFromLayer(result));
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
        name="model-tier"
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
          <StringField
            label="model"
            value={draft.model}
            onChange={(v) => update("model", v)}
            suggestions={MODEL_SUGGESTIONS}
            description="Model ID. Overrides what Claude Code uses by default."
          />
          <StringField
            label="outputStyle"
            value={draft.outputStyle}
            onChange={(v) => update("outputStyle", v)}
            suggestions={OUTPUT_STYLE_SUGGESTIONS}
            description="Named output style; controls the assistant's reply shape."
          />
          <SelectField
            label="effortLevel"
            value={draft.effortLevel}
            onChange={(v) => update("effortLevel", v)}
            choices={EFFORT_CHOICES}
            description="Reasoning effort budget."
          />
          <BoolField
            label="alwaysThinkingEnabled"
            value={draft.alwaysThinkingEnabled}
            onChange={(v) => update("alwaysThinkingEnabled", v)}
            description="Keeps extended-thinking on for every turn."
          />
          <BoolField
            label="includeCoAuthoredBy"
            value={draft.includeCoAuthoredBy}
            onChange={(v) => update("includeCoAuthoredBy", v)}
            description="Appends Co-Authored-By: Claude to commits."
          />

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

function FieldShell({
  label,
  description,
  children,
  onClear,
  canClear,
}: {
  label: string;
  description?: string;
  children: React.ReactNode;
  onClear: () => void;
  canClear: boolean;
}) {
  return (
    <Card variant="soft" className="p-5 space-y-2.5">
      <div className="flex items-baseline justify-between">
        <SectionLabel>{label}</SectionLabel>
        <button
          type="button"
          onClick={onClear}
          disabled={!canClear}
          className={cn(
            "font-body text-xs rounded-full px-2 py-0.5 transition-colors",
            canClear
              ? "text-muted hover:text-ink hover:bg-canvas"
              : "text-muted/40 cursor-not-allowed",
          )}
          title={
            canClear
              ? "Remove this key at this tier (inherit from lower)"
              : "Already inheriting"
          }
        >
          clear
        </button>
      </div>
      {description && <HelpNote>{description}</HelpNote>}
      {children}
    </Card>
  );
}

function StringField({
  label,
  value,
  onChange,
  suggestions,
  description,
}: {
  label: string;
  value: string | null;
  onChange: (v: string | null) => void;
  suggestions?: readonly string[];
  description?: string;
}) {
  const listId = `datalist-${label}`;
  return (
    <FieldShell
      label={label}
      description={description}
      canClear={value !== null}
      onClear={() => onChange(null)}
    >
      <Input
        type="text"
        value={value ?? ""}
        onChange={(e) =>
          onChange(e.target.value === "" ? null : e.target.value)
        }
        placeholder="(inherit)"
        list={suggestions ? listId : undefined}
        className="font-mono"
      />
      {suggestions && (
        <datalist id={listId}>
          {suggestions.map((s) => (
            <option key={s} value={s} />
          ))}
        </datalist>
      )}
    </FieldShell>
  );
}

function SelectField<T extends string>({
  label,
  value,
  onChange,
  choices,
  description,
}: {
  label: string;
  value: string | null;
  onChange: (v: T | null) => void;
  choices: readonly T[];
  description?: string;
}) {
  return (
    <FieldShell
      label={label}
      description={description}
      canClear={value !== null}
      onClear={() => onChange(null)}
    >
      <select
        value={value ?? ""}
        onChange={(e) =>
          onChange(e.target.value === "" ? null : (e.target.value as T))
        }
        className={cn(
          "w-full bg-card border border-hairline rounded-soft-sm px-4 py-3.5",
          "font-mono text-sm text-ink",
          "focus:outline-none focus:border-[1.5px] focus:border-ink focus:shadow-focus-ink",
        )}
      >
        <option value="">(inherit)</option>
        {choices.map((c) => (
          <option key={c} value={c}>
            {c}
          </option>
        ))}
      </select>
    </FieldShell>
  );
}

function BoolField({
  label,
  value,
  onChange,
  description,
}: {
  label: string;
  value: boolean | null;
  onChange: (v: boolean | null) => void;
  description?: string;
}) {
  const options: Array<{ label: string; value: boolean | null }> = [
    { label: "inherit", value: null },
    { label: "true", value: true },
    { label: "false", value: false },
  ];
  return (
    <FieldShell
      label={label}
      description={description}
      canClear={value !== null}
      onClear={() => onChange(null)}
    >
      <div className="flex gap-2">
        {options.map((o) => {
          const selected = value === o.value;
          return (
            <button
              key={o.label}
              type="button"
              onClick={() => onChange(o.value)}
              className={cn(
                "flex-1 rounded-full font-sans text-sm font-medium px-4 py-2.5 transition-colors",
                "focus:outline-none focus-visible:shadow-focus-ink",
                selected
                  ? "bg-ink text-card shadow-lift font-semibold"
                  : "bg-card border border-hairline text-ink hover:bg-canvas",
              )}
            >
              {o.label}
            </button>
          );
        })}
      </div>
    </FieldShell>
  );
}
