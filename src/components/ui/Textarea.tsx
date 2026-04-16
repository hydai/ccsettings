import { forwardRef } from "react";
import type { TextareaHTMLAttributes } from "react";
import { cn } from "../../lib/cn";

interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  error?: boolean;
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ error, className, ...props }, ref) => (
    <textarea
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
Textarea.displayName = "Textarea";
