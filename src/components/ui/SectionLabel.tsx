import type { HTMLAttributes } from "react";
import { cn } from "../../lib/cn";

type SectionLabelProps = HTMLAttributes<HTMLSpanElement>;

export function SectionLabel({
  className,
  children,
  ...props
}: SectionLabelProps) {
  return (
    <span
      className={cn(
        "font-mono text-[10px] font-semibold uppercase tracking-[0.15em] text-caption",
        className,
      )}
      {...props}
    >
      {children}
    </span>
  );
}
