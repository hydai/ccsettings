import { invoke } from "@tauri-apps/api/core";
import { create } from "zustand";
import type { MergedView } from "../types";

type CascadeState = {
  /** The workspace id whose cascade is currently loaded (or loading). */
  workspaceId: string | null;
  loading: boolean;
  error: string | null;
  merged: MergedView | null;

  /** Fetch the cascade for a workspace. If already loaded and not stale,
   *  the call is a cheap no-op. */
  load: (workspaceId: string) => Promise<void>;
  /** Drop the cached cascade (force next `load` to re-fetch). */
  invalidate: () => void;
};

export const useCascade = create<CascadeState>((set, get) => ({
  workspaceId: null,
  loading: false,
  error: null,
  merged: null,

  async load(workspaceId) {
    const cur = get();
    if (
      cur.workspaceId === workspaceId &&
      cur.merged !== null &&
      !cur.loading
    ) {
      return;
    }
    set({ workspaceId, loading: true, error: null });
    try {
      const merged = await invoke<MergedView>("get_cascade", { workspaceId });
      // Only apply if the user hasn't switched workspaces mid-flight.
      if (get().workspaceId === workspaceId) {
        set({ merged, loading: false });
      }
    } catch (e) {
      if (get().workspaceId === workspaceId) {
        set({ error: String(e), loading: false, merged: null });
      }
    }
  },

  invalidate() {
    set({ workspaceId: null, merged: null, error: null });
  },
}));
