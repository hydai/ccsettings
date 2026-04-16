import type { HTMLAttributes } from "react";
import { cn } from "../../lib/cn";

type HelpNoteProps = HTMLAttributes<HTMLParagraphElement>;

export function HelpNote({ className, children, ...props }: HelpNoteProps) {
  return (
    <p
      className={cn(
        "font-body text-[11px] leading-[1.55] text-muted",
        className,
      )}
      {...props}
    >
      {children}
    </p>
  );
}
