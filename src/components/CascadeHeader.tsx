import { HelpCircle } from "lucide-react";
import { useState } from "react";
import { cn } from "../lib/cn";
import {
  TIER_DESCRIPTION,
  TIER_DOT,
  TIER_LABEL,
  TIER_SUBTITLE,
} from "../lib/layers";
import type { LayerKind, MergedView } from "../types";

const LAYER_ORDER: LayerKind[] = [
  "managed",
  "user",
  "user-local",
  "project",
  "project-local",
];

/** Group top-level settings keys by which layers contributed them. */
function collectTopLevelKeys(
  merged: MergedView,
): Record<LayerKind, Set<string>> {
  const out: Record<LayerKind, Set<string>> = {
    managed: new Set(),
    user: new Set(),
    "user-local": new Set(),
    project: new Set(),
    "project-local": new Set(),
  };
  for (const [path, stack] of Object.entries(merged.origins)) {
    // First-level paths look like "/keyname" with no additional slashes.
    if (!path.startsWith("/")) continue;
    const rest = path.slice(1);
    if (rest.length === 0 || rest.includes("/")) continue;
    for (const c of stack) {
      out[c.layer].add(rest);
    }
  }
  return out;
}

export function CascadeHeader({ merged }: { merged: MergedView }) {
  const perLayer = collectTopLevelKeys(merged);
  const [showLegend, setShowLegend] = useState(false);

  return (
    <div className="mb-6">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-xs font-medium uppercase tracking-wider text-muted">
          Cascade · lowest → highest precedence
        </h3>
        <button
          type="button"
          onClick={() => setShowLegend((v) => !v)}
          aria-expanded={showLegend}
          className="flex items-center gap-1 text-xs text-muted hover:text-current px-2 py-1 rounded hover:bg-black/5 dark:hover:bg-white/5"
        >
          <HelpCircle className="w-3.5 h-3.5" />
          {showLegend ? "Hide legend" : "What are these tiers?"}
        </button>
      </div>

      {showLegend && (
        <div className="mb-3 p-3 border border-default rounded surface space-y-2">
          {LAYER_ORDER.map((layer) => (
            <div key={layer} className="flex gap-2 text-xs">
              <span
                className={cn(
                  "w-2 h-2 rounded-full mt-1.5 flex-shrink-0",
                  TIER_DOT[layer],
                )}
                aria-hidden
              />
              <div className="flex-1">
                <span className="font-medium">{TIER_LABEL[layer]}</span>
                <span className="text-muted"> · {TIER_SUBTITLE[layer]}</span>
                <div className="text-muted">{TIER_DESCRIPTION[layer]}</div>
              </div>
            </div>
          ))}
          <p className="text-xs text-muted pt-2 border-t border-default">
            Later tiers override earlier ones, except:{" "}
            <code className="font-mono">hooks</code> arrays append across tiers,
            and <code className="font-mono">permissions.allow/deny/ask</code>{" "}
            union (dedup by value).
          </p>
        </div>
      )}

      <div className="grid grid-cols-5 gap-2">
        {LAYER_ORDER.map((layer) => {
          const keys = [...perLayer[layer]].sort();
          return (
            <div
              key={layer}
              title={TIER_DESCRIPTION[layer]}
              className="border border-default rounded-lg p-3 surface min-h-[7rem]"
            >
              <div className="flex items-center gap-2 mb-1">
                <span
                  className={cn("w-2 h-2 rounded-full", TIER_DOT[layer])}
                  aria-hidden
                />
                <span className="text-xs font-medium uppercase tracking-wider text-muted">
                  {TIER_LABEL[layer]}
                </span>
              </div>
              <div className="text-[10px] text-muted mb-2 line-clamp-1">
                {TIER_SUBTITLE[layer]}
              </div>
              {keys.length === 0 ? (
                <div className="text-xs text-muted">—</div>
              ) : (
                <ul className="space-y-1">
                  {keys.map((key) => (
                    <li
                      key={key}
                      className="text-sm font-mono truncate"
                      title={key}
                    >
                      {key}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
