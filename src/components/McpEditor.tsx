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

type McpTierToggles = { enabled: string[]; disabled: string[] };

type McpState = {
  user_servers: Record<string, Record<string, unknown>>;
  user_servers_path: string;
  project_servers: Record<string, Record<string, unknown>>;
  project_servers_path: string;
  per_tier: Record<string, McpTierToggles>;
};

/** Draft state: for each server name, what this tier should say about it.
 *  "enabled" → in enabledMcpjsonServers; "disabled" → in disabledMcpjsonServers;
 *  null → in neither (inherit). */
type TargetValue = "enabled" | "disabled" | null;

function perTierLayerOrder(): LayerKind[] {
  return ["project-local", "project", "user-local", "user", "managed"];
}

function computeEffective(
  state: McpState,
  name: string,
): { value: TargetValue; source: LayerKind } | null {
  for (const layer of perTierLayerOrder()) {
    const t = state.per_tier[layer];
    if (!t) continue;
    if (t.enabled.includes(name))
      return { value: "enabled", source: layer };
    if (t.disabled.includes(name))
      return { value: "disabled", source: layer };
  }
  return null;
}

function draftFromTier(layerFile: LayerFile | null): Record<string, TargetValue> {
  const c = layerFile?.content as Record<string, unknown> | null;
  const en = Array.isArray(c?.enabledMcpjsonServers)
    ? (c!.enabledMcpjsonServers as unknown[]).filter(
        (x): x is string => typeof x === "string",
      )
    : [];
  const dis = Array.isArray(c?.disabledMcpjsonServers)
    ? (c!.disabledMcpjsonServers as unknown[]).filter(
        (x): x is string => typeof x === "string",
      )
    : [];
  const out: Record<string, TargetValue> = {};
  for (const n of en) out[n] = "enabled";
  for (const n of dis) out[n] = "disabled";
  return out;
}

function buildNewValue(
  original: LayerFile | null,
  draft: Record<string, TargetValue>,
): unknown {
  const base = {
    ...((original?.content as Record<string, unknown>) ?? {}),
  };
  const enabled: string[] = [];
  const disabled: string[] = [];
  for (const [name, v] of Object.entries(draft)) {
    if (v === "enabled") enabled.push(name);
    else if (v === "disabled") disabled.push(name);
  }
  if (enabled.length > 0) base.enabledMcpjsonServers = enabled;
  else delete base.enabledMcpjsonServers;
  if (disabled.length > 0) base.disabledMcpjsonServers = disabled;
  else delete base.disabledMcpjsonServers;
  return base;
}

type Props = { workspace: Workspace };

export function McpEditor({ workspace }: Props) {
  const [target, setTarget] = useState<LayerKind>("project-local");
  const [state, setState] = useState<McpState | null>(null);
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
      invoke<McpState>("get_mcp_state", { workspaceId: workspace.id }),
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

  function cycle(name: string) {
    setDraft((d) => {
      const cur = d[name] ?? null;
      const next: TargetValue =
        cur === null ? "enabled" : cur === "enabled" ? "disabled" : null;
      const copy = { ...d };
      if (next === null) delete copy[name];
      else copy[name] = next;
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
      const next = await invoke<McpState>("get_mcp_state", {
        workspaceId: workspace.id,
      });
      setState(next);
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
        name="mcp-tier"
      />

      {loading && <p className="text-sm text-muted">Loading MCP state…</p>}
      {layerFile?.parse_error && (
        <div className="border border-red-500/30 bg-red-500/5 rounded p-3 text-sm text-red-500">
          This tier's file could not be parsed: {layerFile.parse_error}.
        </div>
      )}

      {!loading && state && !layerFile?.parse_error && (
        <>
          <ServerGroup
            title="Project-scope servers"
            hint={state.project_servers_path}
            servers={state.project_servers}
            state={state}
            draft={draft}
            onCycle={cycle}
          />

          <ServerGroup
            title="User-scope servers (read-only)"
            hint={state.user_servers_path}
            servers={state.user_servers}
            state={state}
            draft={draft}
            onCycle={cycle}
          />

          <SaveControls
            dirty={dirty}
            saving={saving}
            savedAt={savedAt}
            saveLabel={`Save to ${TIER_LABEL[target]}`}
            error={error}
            onSave={save}
            onDiscard={revert}
          />

          <p className="text-xs text-muted">
            Server definitions (command, args, URL, …) aren't editable from
            ccsettings in v1 — edit <code>{state.project_servers_path}</code>{" "}
            or Claude Code's own config directly. Toggles above only update
            the <code>enabledMcpjsonServers</code> /{" "}
            <code>disabledMcpjsonServers</code> arrays in the selected tier's{" "}
            <code>settings.json</code>.
          </p>
        </>
      )}
    </div>
  );
}

function ServerGroup({
  title,
  hint,
  servers,
  state,
  draft,
  onCycle,
}: {
  title: string;
  hint: string;
  servers: Record<string, Record<string, unknown>>;
  state: McpState;
  draft: Record<string, TargetValue>;
  onCycle: (name: string) => void;
}) {
  const names = Object.keys(servers).sort();
  return (
    <section>
      <div className="flex items-baseline justify-between mb-2">
        <h3 className="text-xs font-medium uppercase tracking-wider text-muted">
          {title}
        </h3>
        <span className="text-xs text-muted font-mono truncate max-w-md" title={hint}>
          {hint}
        </span>
      </div>
      {names.length === 0 ? (
        <div className="text-xs text-muted italic px-3 py-2 border border-dashed border-default rounded">
          none defined
        </div>
      ) : (
        <ul className="space-y-1">
          {names.map((name) => {
            const def = servers[name];
            const effective = computeEffective(state, name);
            const draftValue = draft[name] ?? null;
            return (
              <li
                key={name}
                className="flex items-center gap-3 p-3 border border-default rounded surface"
              >
                <div className="flex-1 min-w-0">
                  <div className="font-mono text-sm truncate">{name}</div>
                  <div className="text-xs text-muted truncate">
                    {describeServer(def)}
                  </div>
                </div>

                <EffectiveBadge effective={effective} />

                <button
                  type="button"
                  onClick={() => onCycle(name)}
                  className={cn(
                    "w-28 px-3 py-1.5 rounded text-sm border border-default font-medium",
                    draftValue === "enabled"
                      ? "bg-green-600/20 text-green-700 dark:text-green-400"
                      : draftValue === "disabled"
                        ? "bg-red-600/20 text-red-700 dark:text-red-400"
                        : "text-muted hover:bg-black/5 dark:hover:bg-white/5",
                  )}
                  title="Click to cycle: inherit → enabled → disabled → inherit"
                >
                  {draftValue === "enabled"
                    ? "Enabled"
                    : draftValue === "disabled"
                      ? "Disabled"
                      : "(inherit)"}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function EffectiveBadge({
  effective,
}: {
  effective: { value: TargetValue; source: LayerKind } | null;
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
        effective.value === "enabled"
          ? "border-green-500/30 text-green-700 dark:text-green-400"
          : "border-red-500/30 text-red-700 dark:text-red-400",
      )}
      title={`From ${TIER_LABEL[effective.source]}`}
    >
      effective: {effective.value}
    </span>
  );
}

function describeServer(def: Record<string, unknown>): string {
  const type = typeof def.type === "string" ? def.type : null;
  if (type === "http" || type === "sse") {
    const url = typeof def.url === "string" ? def.url : "(no url)";
    return `${type} · ${url}`;
  }
  const command = typeof def.command === "string" ? def.command : null;
  const args = Array.isArray(def.args)
    ? def.args.filter((x: unknown): x is string => typeof x === "string")
    : [];
  if (command) {
    return `${type ?? "stdio"} · ${command}${args.length ? " " + args.join(" ") : ""}`;
  }
  return type ?? "unknown transport";
}
