import type { HTMLAttributes } from "react";
import { cn } from "../../lib/cn";

export type CardVariant = "soft" | "pad" | "inverse" | "cream";

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  variant?: CardVariant;
}

const VARIANT: Record<CardVariant, string> = {
  soft: "bg-card shadow-soft rounded-soft-md",
  pad: "bg-pad rounded-soft-lg",
  inverse: "bg-ink text-card rounded-soft-md",
  cream: "bg-canvas shadow-soft rounded-soft-lg",
};

export function Card({
  variant = "soft",
  className,
  children,
  ...props
}: CardProps) {
  return (
    <div className={cn(VARIANT[variant], className)} {...props}>
      {children}
    </div>
  );
}
