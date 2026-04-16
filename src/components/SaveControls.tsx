import { Check, Loader2 } from "lucide-react";
import { cn } from "../lib/cn";
import { HelpNote } from "./ui";

type Props = {
  dirty: boolean;
  saving: boolean;
  savedAt: number | null;
  saveLabel: string;
  error?: string | null;
  onSave: () => void;
  onDiscard: () => void;
  /** Retry save with no hash precondition — overwrites external changes.
   *  When provided and the error is a "conflict:", extra action buttons appear. */
  onForceSave?: () => void;
};

export function SaveControls({
  dirty,
  saving,
  savedAt,
  saveLabel,
  error,
  onSave,
  onDiscard,
  onForceSave,
}: Props) {
  const isConflict = !!error && error.startsWith("conflict:");

  if (isConflict) {
    return (
      <div className="space-y-3">
        <div
          className={cn(
            "h-16 rounded-soft-md flex items-center justify-between gap-4",
            "pl-6 pr-5 bg-conflict text-card",
          )}
        >
          <span className="font-sans text-sm font-semibold">
            Conflict — the file changed on disk
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onDiscard}
              disabled={saving}
              className={cn(
                "rounded-full font-sans text-xs font-medium px-3.5 py-1.5",
                "bg-card/15 text-card hover:bg-card/25 transition-colors",
                "disabled:opacity-40 disabled:cursor-not-allowed",
                "focus:outline-none focus-visible:shadow-focus-ink",
              )}
            >
              Discard &amp; reload
            </button>
            {onForceSave && (
              <button
                type="button"
                onClick={onForceSave}
                disabled={saving}
                className={cn(
                  "rounded-full font-sans text-xs font-semibold px-4 py-1.5",
                  "bg-card text-conflict hover:bg-canvas transition-colors",
                  "disabled:opacity-40 disabled:cursor-not-allowed",
                  "focus:outline-none focus-visible:shadow-focus-ink",
                )}
                title="Save your version. The prior disk content is captured as a backup."
              >
                Overwrite anyway
              </button>
            )}
          </div>
        </div>
        <HelpNote>
          Overwriting still captures a backup of the current disk content first
          — you can restore it from the Backups drawer if you change your mind.
        </HelpNote>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div
        className={cn(
          "h-16 rounded-soft-md flex items-center justify-between gap-4",
          "pl-6 pr-5 bg-ink text-card",
        )}
      >
        <div className="flex items-center gap-3 min-w-0">
          {saving ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin text-card/70" />
              <span className="font-sans text-sm text-card/80">Saving…</span>
            </>
          ) : dirty ? (
            <span className="font-sans text-sm text-card/80">
              Unsaved changes
            </span>
          ) : savedAt ? (
            <>
              <Check className="w-4 h-4 text-card/70" strokeWidth={2.5} />
              <span className="font-mono text-[11px] text-card/70">
                Saved at {new Date(savedAt).toLocaleTimeString()}
              </span>
            </>
          ) : (
            <span className="font-mono text-[11px] text-card/50">
              Ready to edit
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onDiscard}
            disabled={!dirty || saving}
            className={cn(
              "rounded-full font-sans text-xs font-medium px-3.5 py-1.5 transition-colors",
              "focus:outline-none focus-visible:shadow-focus-ink",
              dirty && !saving
                ? "bg-card/10 text-card hover:bg-card/20"
                : "text-card/30 cursor-not-allowed",
            )}
          >
            Discard
          </button>
          <button
            type="button"
            onClick={onSave}
            disabled={!dirty || saving}
            className={cn(
              "inline-flex items-center gap-2 rounded-full font-sans text-xs font-semibold px-4 py-1.5",
              "transition-colors",
              "focus:outline-none focus-visible:shadow-focus-ink",
              dirty && !saving
                ? "bg-card text-ink hover:bg-canvas"
                : "bg-card/20 text-card/40 cursor-not-allowed",
            )}
          >
            {saving ? "Saving…" : saveLabel}
            {dirty && !saving && (
              <span className="font-mono text-[10px] tracking-wider bg-ink/10 text-ink/70 rounded-full px-1.5 py-0.5">
                ⌘S
              </span>
            )}
          </button>
        </div>
      </div>

      {error && !isConflict && (
        <div
          className={cn(
            "border-[1.5px] border-danger-soft rounded-soft-sm p-3 bg-card",
            "font-body text-sm text-danger-soft",
          )}
        >
          {error}
        </div>
      )}
    </div>
  );
}
