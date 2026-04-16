import { cn } from "../lib/cn";

type Props = {
  dirty: boolean;
  saving: boolean;
  savedAt: number | null;
  saveLabel: string;
  error?: string | null;
  onSave: () => void;
  onDiscard: () => void;
  /** Retry the save with no hash precondition — overwrites external changes.
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
  return (
    <>
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onSave}
          disabled={!dirty || saving}
          className={cn(
            "px-4 py-2 rounded text-sm font-medium",
            dirty && !saving
              ? "bg-blue-600 text-white hover:bg-blue-700"
              : "bg-black/10 dark:bg-white/10 text-muted cursor-not-allowed",
          )}
        >
          {saving ? "Saving…" : saveLabel}
        </button>
        <button
          type="button"
          onClick={onDiscard}
          disabled={!dirty || saving}
          className={cn(
            "px-4 py-2 rounded text-sm border border-default",
            dirty && !saving
              ? "hover:bg-black/5 dark:hover:bg-white/5"
              : "opacity-40 cursor-not-allowed",
          )}
        >
          Discard changes
        </button>
        {savedAt && !dirty && !saving && (
          <span className="text-xs text-muted">
            Saved at {new Date(savedAt).toLocaleTimeString()}
          </span>
        )}
      </div>

      {error &&
        (isConflict ? (
          <div className="border border-red-500/30 bg-red-500/5 rounded p-3 mt-3 space-y-2">
            <p className="text-sm text-red-500">
              <strong>Conflict:</strong> the file changed on disk while you
              were editing. Pick one:
            </p>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={onDiscard}
                disabled={saving}
                className={cn(
                  "px-3 py-1.5 rounded text-sm border border-default",
                  "hover:bg-black/5 dark:hover:bg-white/5",
                  saving && "opacity-40 cursor-not-allowed",
                )}
              >
                Discard and reload from disk
              </button>
              {onForceSave && (
                <button
                  type="button"
                  onClick={onForceSave}
                  disabled={saving}
                  className={cn(
                    "px-3 py-1.5 rounded text-sm bg-red-600/80 text-white",
                    "hover:bg-red-600",
                    saving && "opacity-40 cursor-not-allowed",
                  )}
                  title="Save your version, overwriting what's on disk. The prior disk content is still in Backups if you need it."
                >
                  Overwrite anyway
                </button>
              )}
            </div>
            <p className="text-xs text-muted">
              Overwriting still captures a backup of the current disk content
              first — you can restore it from the Backups drawer if you change
              your mind.
            </p>
          </div>
        ) : (
          <div className="border border-red-500/30 bg-red-500/5 rounded p-3 text-sm text-red-500 mt-3">
            {error}
          </div>
        ))}
    </>
  );
}
