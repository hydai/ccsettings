import { forwardRef } from "react";
import type { InputHTMLAttributes } from "react";
import { cn } from "../../lib/cn";

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  error?: boolean;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ error, className, ...props }, ref) => (
    <input
      ref={ref}
      className={cn(
        "w-full bg-card rounded-soft-sm px-4 py-3.5 text-sm font-sans",
        "text-ink placeholder:text-muted",
        "focus:outline-none focus:shadow-focus-ink",
        error
          ? "border-[1.5px] border-danger-soft"
          : "border border-hairline focus:border-[1.5px] focus:border-ink",
        className,
      )}
      {...props}
    />
  ),
);
Input.displayName = "Input";
