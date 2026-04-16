import { Check } from "lucide-react";
import { cn } from "../lib/cn";
import {
  TIER_DESCRIPTION,
  TIER_DOT,
  TIER_LABEL,
  TIER_SUBTITLE,
  WRITABLE_TIERS,
} from "../lib/layers";
import type { LayerKind } from "../types";
import { Card, SectionLabel } from "./ui";

type Props = {
  value: LayerKind;
  onChange: (tier: LayerKind) => void;
  /** Absolute path of the selected tier's file, shown on the right. */
  currentPath?: string | null;
  /** Radio group name when multiple pickers render simultaneously. */
  name?: string;
};

export function TierPicker({
  value,
  onChange,
  currentPath,
  name = "tier-picker",
}: Props) {
  return (
    <Card variant="cream" className="p-7">
      <div className="flex items-center justify-between gap-4 mb-3">
        <SectionLabel>Write to</SectionLabel>
        {currentPath && (
          <span
            className="font-mono text-[11px] text-muted truncate max-w-[380px]"
            title={currentPath}
          >
            {currentPath}
          </span>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2.5">
        {WRITABLE_TIERS.map((t) => {
          const active = value === t;
          return (
            <label
              key={t}
              title={TIER_DESCRIPTION[t]}
              className={cn(
                "inline-flex items-center gap-2.5 rounded-full cursor-pointer transition-colors",
                "font-body text-[13px] px-[18px] py-2.5",
                active
                  ? "bg-ink text-card font-semibold shadow-lift"
                  : "bg-card border border-hairline text-ink font-medium hover:bg-canvas",
              )}
            >
              <input
                type="radio"
                name={name}
                checked={active}
                onChange={() => onChange(t)}
                className="sr-only"
              />
              <span className={cn("w-2.5 h-2.5 rounded-full", TIER_DOT[t])} />
              <span>{TIER_LABEL[t]}</span>
              <span
                className={cn(
                  "text-xs hidden lg:inline",
                  active ? "text-card/70" : "text-muted",
                )}
              >
                · {TIER_SUBTITLE[t]}
              </span>
              {active && <Check className="w-3 h-3 ml-0.5" strokeWidth={2.5} />}
            </label>
          );
        })}
      </div>

      <p className="font-body text-xs leading-[1.55] text-muted mt-3">
        {TIER_DESCRIPTION[value]}
      </p>
    </Card>
  );
}
