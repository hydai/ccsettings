import { cn } from "../lib/cn";
import { TIER_DOT, TIER_LABEL, WRITABLE_TIERS } from "../lib/layers";
import type { LayerKind } from "../types";

type Props = {
  value: LayerKind;
  onChange: (tier: LayerKind) => void;
  /** Absolute path of the selected tier's file, shown on the right for context. */
  currentPath?: string | null;
  /** Optional radio group name when multiple pickers render simultaneously. */
  name?: string;
};

export function TierPicker({
  value,
  onChange,
  currentPath,
  name = "tier-picker",
}: Props) {
  return (
    <div className="flex flex-wrap items-center gap-3 p-3 border border-default rounded surface">
      <span className="text-sm text-muted">Write to:</span>
      {WRITABLE_TIERS.map((t) => (
        <label
          key={t}
          className={cn(
            "flex items-center gap-1.5 px-2 py-1 rounded cursor-pointer text-sm",
            value === t
              ? "bg-black/10 dark:bg-white/10"
              : "hover:bg-black/5 dark:hover:bg-white/5",
          )}
        >
          <input
            type="radio"
            name={name}
            checked={value === t}
            onChange={() => onChange(t)}
            className="sr-only"
          />
          <span className={cn("w-2 h-2 rounded-full", TIER_DOT[t])} />
          <span>{TIER_LABEL[t]}</span>
        </label>
      ))}
      {currentPath && (
        <span
          className="text-xs text-muted font-mono truncate ml-auto"
          title={currentPath}
        >
          {currentPath}
        </span>
      )}
    </div>
  );
}
