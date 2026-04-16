import { cn } from "../lib/cn";

type Props = {
  dirty: boolean;
  saving: boolean;
  savedAt: number | null;
  saveLabel: string;
  error?: string | null;
  onSave: () => void;
  onDiscard: () => void;
};

export function SaveControls({
  dirty,
  saving,
  savedAt,
  saveLabel,
  error,
  onSave,
  onDiscard,
}: Props) {
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

      {error && (
        <div className="border border-red-500/30 bg-red-500/5 rounded p-3 text-sm text-red-500 mt-3">
          {error.startsWith("conflict:") ? (
            <>
              <strong>Conflict:</strong> the file changed on disk while you
              were editing. Click <em>Discard changes</em> to pull the latest,
              or copy your edits elsewhere before reloading.
            </>
          ) : (
            error
          )}
        </div>
      )}
    </>
  );
}
