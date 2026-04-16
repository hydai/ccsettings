import { HelpCircle } from "lucide-react";
import { useMemo, useState } from "react";
import { cn } from "../lib/cn";
import {
  TIER_DESCRIPTION,
  TIER_DOT,
  TIER_LABEL,
  TIER_SUBTITLE,
} from "../lib/layers";
import type { LayerKind, MergedView } from "../types";
import { Card, SectionLabel } from "./ui";

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

  // Highest-precedence tier that contributed something — the "winning" column.
  const winningTier = useMemo<LayerKind | null>(() => {
    for (let i = LAYER_ORDER.length - 1; i >= 0; i--) {
      if (perLayer[LAYER_ORDER[i]].size > 0) return LAYER_ORDER[i];
    }
    return null;
  }, [perLayer]);

  return (
    <Card variant="soft" className="p-8 space-y-5">
      <div className="flex items-end justify-between gap-4">
        <div className="space-y-1">
          <SectionLabel>Cascade · 5 tiers</SectionLabel>
          <p className="font-body text-sm text-body">
            Later tiers override earlier ones →
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowLegend((v) => !v)}
          aria-expanded={showLegend}
          className={cn(
            "inline-flex items-center gap-1.5 rounded-full px-3 py-1.5",
            "font-sans text-xs text-muted hover:text-ink hover:bg-canvas transition-colors",
            "focus:outline-none focus-visible:shadow-focus-ink",
          )}
        >
          <HelpCircle className="w-3.5 h-3.5" />
          {showLegend ? "Hide legend" : "What are these tiers?"}
        </button>
      </div>

      {showLegend && (
        <Card variant="cream" className="p-5 space-y-3">
          {LAYER_ORDER.map((layer) => (
            <div key={layer} className="flex gap-2.5">
              <span
                className={cn(
                  "w-2.5 h-2.5 rounded-full mt-1.5 flex-shrink-0",
                  TIER_DOT[layer],
                )}
                aria-hidden
              />
              <div className="flex-1 font-body text-xs leading-[1.55]">
                <span className="font-semibold text-ink">
                  {TIER_LABEL[layer]}
                </span>
                <span className="text-muted"> · {TIER_SUBTITLE[layer]}</span>
                <div className="text-muted mt-0.5">
                  {TIER_DESCRIPTION[layer]}
                </div>
              </div>
            </div>
          ))}
          <p className="font-body text-xs text-muted pt-3 border-t border-hairline leading-[1.55]">
            Later tiers override earlier ones, except:{" "}
            <code className="font-mono">hooks</code> arrays append across
            tiers, and{" "}
            <code className="font-mono">permissions.allow/deny/ask</code> union
            (dedup by value).
          </p>
        </Card>
      )}

      <div className="grid grid-cols-5 gap-4">
        {LAYER_ORDER.map((layer) => {
          const keys = [...perLayer[layer]].sort();
          const highlighted = layer === winningTier;
          return (
            <div
              key={layer}
              title={TIER_DESCRIPTION[layer]}
              className={cn(
                "rounded-soft-md p-5 min-h-[9rem] transition-colors",
                highlighted
                  ? "bg-amber-500/10 dark:bg-amber-400/15 border-[1.5px] border-amber-500 dark:border-amber-400"
                  : "bg-card-cream",
              )}
            >
              <div className="flex items-center gap-2">
                <span
                  className={cn(
                    "w-2.5 h-2.5 rounded-full",
                    TIER_DOT[layer],
                  )}
                  aria-hidden
                />
                <span className="font-sans text-xs font-semibold text-ink">
                  {TIER_LABEL[layer]}
                </span>
              </div>
              <div className="font-body text-[10px] text-muted mt-1 truncate">
                {TIER_SUBTITLE[layer]}
              </div>
              {keys.length === 0 ? (
                <div className="font-mono text-xs text-muted mt-3">—</div>
              ) : (
                <ul className="space-y-1 mt-3">
                  {keys.map((key) => (
                    <li
                      key={key}
                      className="font-mono text-xs text-ink truncate"
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
    </Card>
  );
}
