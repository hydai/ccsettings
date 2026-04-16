import type { ButtonHTMLAttributes } from "react";
import { cn } from "../../lib/cn";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "destructive";
export type ButtonSize = "sm" | "md";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Trailing keyboard-shortcut chip rendered inside the button. */
  shortcut?: string;
  /** Square icon-only mode; set when children is just an icon. */
  iconOnly?: boolean;
}

const BASE =
  "inline-flex items-center justify-center gap-2 rounded-full font-sans font-medium " +
  "transition-colors transition-shadow focus:outline-none " +
  "focus-visible:shadow-focus-ink disabled:cursor-not-allowed";

const VARIANT: Record<ButtonVariant, string> = {
  primary:
    "bg-inverse text-on-inverse shadow-soft hover:bg-inverse-alt disabled:opacity-30",
  secondary:
    "bg-card text-ink border-[1.5px] border-ink hover:bg-canvas disabled:opacity-40",
  ghost: "bg-transparent text-ink hover:bg-canvas disabled:opacity-40",
  destructive:
    "bg-card text-danger-soft border-[1.5px] border-danger hover:bg-danger hover:text-on-inverse disabled:opacity-40",
};

const SIZE: Record<ButtonSize, string> = {
  sm: "text-xs px-3.5 py-1.5",
  md: "text-sm px-[18px] py-[11px]",
};

const ICON_ONLY_SIZE: Record<ButtonSize, string> = {
  sm: "w-8 h-8 p-0",
  md: "w-10 h-10 p-0",
};

const SHORTCUT: Record<ButtonVariant, string> = {
  primary: "bg-on-inverse/15 text-on-inverse/85",
  secondary: "bg-ink/10 text-ink/70",
  ghost: "bg-ink/10 text-ink/70",
  destructive: "bg-danger-soft/10 text-danger-soft/85",
};

export function Button({
  variant = "primary",
  size = "md",
  shortcut,
  iconOnly = false,
  className,
  children,
  ...props
}: ButtonProps) {
  return (
    <button
      className={cn(
        BASE,
        VARIANT[variant],
        iconOnly ? ICON_ONLY_SIZE[size] : SIZE[size],
        shortcut ? "pr-2" : "",
        className,
      )}
      {...props}
    >
      {children}
      {shortcut ? (
        <span
          className={cn(
            "ml-1 rounded-full px-2 py-0.5 font-mono text-[10px] tracking-wider",
            SHORTCUT[variant],
          )}
        >
          {shortcut}
        </span>
      ) : null}
    </button>
  );
}
