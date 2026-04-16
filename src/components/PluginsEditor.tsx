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
import { SaveControls } from "./SaveControls";
import { TierPicker } from "./TierPicker";

type InstalledPlugin = {
  key: string;
  name: string;
  marketplace: string;
  version: string | null;
  scope: string | null;
  install_path: string | null;
};

type PluginsState = {
  installed: InstalledPlugin[];
  /** per_tier[layer][key] = bool. layer is kebab-case. */
  per_tier: Record<string, Record<string, boolean>>;
};

type TargetValue = boolean | null; // null = not set at target

function perTierLayerOrder(): LayerKind[] {
  // Highest precedence first (for effective-value lookup).
  return ["project-local", "project", "user-local", "user", "managed"];
}

function computeEffective(
  state: PluginsState,
  key: string,
): { value: boolean; source: LayerKind } | null {
  for (const layer of perTierLayerOrder()) {
    const tierMap = state.per_tier[layer];
    if (tierMap && key in tierMap) {
      return { value: tierMap[key], source: layer };
    }
  }
  return null;
}

function draftFromTier(
  layerFile: LayerFile | null,
): Record<string, TargetValue> {
  const ep = (layerFile?.content as Record<string, unknown> | null)
    ?.enabledPlugins;
  if (!ep || typeof ep !== "object") return {};
  const out: Record<string, TargetValue> = {};
  for (const [k, v] of Object.entries(ep as Record<string, unknown>)) {
    if (typeof v === "boolean") out[k] = v;
  }
  return out;
}

function buildNewValue(
  original: LayerFile | null,
  draft: Record<string, TargetValue>,
): unknown {
  const base = {
    ...((original?.content as Record<string, unknown>) ?? {}),
  };
  const ep: Record<string, boolean> = {};
  for (const [k, v] of Object.entries(draft)) {
    if (v !== null) ep[k] = v;
  }
  if (Object.keys(ep).length > 0) {
    base.enabledPlugins = ep;
  } else {
    delete base.enabledPlugins;
  }
  return base;
}

type Props = { workspace: Workspace };

export function PluginsEditor({ workspace }: Props) {
  const [target, setTarget] = useState<LayerKind>("user");
  const [state, setState] = useState<PluginsState | null>(null);
  const [layerFile, setLayerFile] = useState<LayerFile | null>(null);
  const [draft, setDraft] = useState<Record<string, TargetValue>>({});
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  const cascadeLoad = useCascade((s) => s.load);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    Promise.all([
      invoke<PluginsState>("get_plugins_state", { workspaceId: workspace.id }),
      getLayerContent(workspace.id, target),
    ])
      .then(([s, lf]) => {
        if (!active) return;
        setState(s);
        setLayerFile(lf);
        setDraft(draftFromTier(lf));
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
    JSON.stringify(draft) !== JSON.stringify(draftFromTier(layerFile));

  function cycle(key: string) {
    setDraft((d) => {
      const cur = d[key] ?? null;
      const next: TargetValue =
        cur === null ? true : cur === true ? false : null;
      const copy = { ...d };
      if (next === null) delete copy[key];
      else copy[key] = next;
      return copy;
    });
  }

  function revert() {
    setDraft(draftFromTier(layerFile));
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
      setDraft(draftFromTier(result));
      setSavedAt(Date.now());
      useCascade.getState().invalidate();
      await cascadeLoad(workspace.id);
      // Re-fetch the plugins state too so per_tier reflects our write.
      const nextState = await invoke<PluginsState>("get_plugins_state", {
        workspaceId: workspace.id,
      });
      setState(nextState);
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
        name="plugins-tier"
      />

      {loading && <p className="text-sm text-muted">Loading plugins…</p>}
      {layerFile?.parse_error && (
        <div className="border border-red-500/30 bg-red-500/5 rounded p-3 text-sm text-red-500">
          This tier's file could not be parsed: {layerFile.parse_error}.
        </div>
      )}

      {!loading && state && !layerFile?.parse_error && (
        <>
          {state.installed.length === 0 ? (
            <div className="text-sm text-muted border border-dashed border-default rounded p-3">
              No plugins installed. Claude Code tracks installs in{" "}
              <span className="font-mono">
                ~/.claude/plugins/installed_plugins.json
              </span>
              .
            </div>
          ) : (
            <ul className="space-y-1">
              {state.installed.map((p) => {
                const effective = computeEffective(state, p.key);
                const draftValue = draft[p.key] ?? null;
                return (
                  <li
                    key={p.key}
                    className="flex items-center gap-3 p-3 border border-default rounded surface"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="font-mono text-sm truncate" title={p.key}>
                        {p.name}
                        <span className="text-muted">@{p.marketplace}</span>
                      </div>
                      <div className="text-xs text-muted flex gap-3 mt-0.5">
                        {p.version && <span>v{p.version}</span>}
                        {p.scope && <span>{p.scope}</span>}
                      </div>
                    </div>

                    <EffectiveBadge effective={effective} />

                    <button
                      type="button"
                      onClick={() => cycle(p.key)}
                      className={cn(
                        "w-28 px-3 py-1.5 rounded text-sm border border-default font-medium",
                        draftValue === true
                          ? "bg-green-600/20 text-green-700 dark:text-green-400"
                          : draftValue === false
                            ? "bg-red-600/20 text-red-700 dark:text-red-400"
                            : "text-muted hover:bg-black/5 dark:hover:bg-white/5",
                      )}
                      title="Click to cycle: inherit → on → off → inherit"
                    >
                      {draftValue === true
                        ? "On"
                        : draftValue === false
                          ? "Off"
                          : "(inherit)"}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}

          {state.installed.length > 0 && (
            <SaveControls
              dirty={dirty}
              saving={saving}
              savedAt={savedAt}
              saveLabel={`Save to ${TIER_LABEL[target]}`}
              error={error}
              onSave={save}
              onDiscard={revert}
            />
          )}
        </>
      )}
    </div>
  );
}

function EffectiveBadge({
  effective,
}: {
  effective: { value: boolean; source: LayerKind } | null;
}) {
  if (!effective) {
    return (
      <span className="text-xs text-muted px-2 py-0.5 rounded border border-dashed border-default">
        not set
      </span>
    );
  }
  return (
    <span
      className={cn(
        "text-xs px-2 py-0.5 rounded border",
        effective.value
          ? "border-green-500/30 text-green-700 dark:text-green-400"
          : "border-red-500/30 text-red-700 dark:text-red-400",
      )}
      title={`From ${TIER_LABEL[effective.source]}`}
    >
      {effective.value ? "effective: on" : "effective: off"}
    </span>
  );
}
