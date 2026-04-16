import { cn } from "../lib/cn";
import type { LayerKind, MergedView } from "../types";

const LAYER_ORDER: LayerKind[] = [
  "managed",
  "user",
  "user-local",
  "project",
  "project-local",
];

const LAYER_LABELS: Record<LayerKind, string> = {
  managed: "Managed",
  user: "User",
  "user-local": "User Local",
  project: "Project",
  "project-local": "Project Local",
};

// Static class map (keeps Tailwind's content scanner happy — no dynamic
// class name concatenation).
const LAYER_DOT: Record<LayerKind, string> = {
  managed: "bg-layer-managed",
  user: "bg-layer-user",
  "user-local": "bg-layer-user-local",
  project: "bg-layer-project",
  "project-local": "bg-layer-project-local",
};

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

  return (
    <div className="grid grid-cols-5 gap-2 mb-6">
      {LAYER_ORDER.map((layer) => {
        const keys = [...perLayer[layer]].sort();
        return (
          <div
            key={layer}
            className="border border-default rounded-lg p-3 surface min-h-[7rem]"
          >
            <div className="flex items-center gap-2 mb-2">
              <span
                className={cn("w-2 h-2 rounded-full", LAYER_DOT[layer])}
                aria-hidden
              />
              <span className="text-xs font-medium uppercase tracking-wider text-muted">
                {LAYER_LABELS[layer]}
              </span>
            </div>
            {keys.length === 0 ? (
              <div className="text-xs text-muted">—</div>
            ) : (
              <ul className="space-y-1">
                {keys.map((key) => (
                  <li key={key} className="text-sm font-mono truncate" title={key}>
                    {key}
                  </li>
                ))}
              </ul>
            )}
          </div>
        );
      })}
    </div>
  );
}
