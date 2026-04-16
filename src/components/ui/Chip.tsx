import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "../../lib/cn";

export type ChipVariant = "neutral" | "active" | "tier-tag";

interface ChipProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: ChipVariant;
  /** Tailwind bg-* class for the leading 10px dot. */
  dot?: string;
  /** Trailing element, usually an icon. */
  trailing?: ReactNode;
}

const VARIANT: Record<ChipVariant, string> = {
  neutral: "bg-card border border-hairline text-ink font-medium",
  active: "bg-ink text-card font-semibold shadow-lift",
  "tier-tag": "text-ink/80 font-semibold",
};

export function Chip({
  variant = "neutral",
  dot,
  trailing,
  className,
  children,
  ...props
}: ChipProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-2.5 rounded-full px-[18px] py-2.5 text-[13px] font-body",
        VARIANT[variant],
        className,
      )}
      {...props}
    >
      {dot ? <span className={cn("h-2.5 w-2.5 rounded-full", dot)} /> : null}
      {children}
      {trailing ? <span className="flex items-center">{trailing}</span> : null}
    </span>
  );
}
