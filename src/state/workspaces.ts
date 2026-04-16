import { invoke } from "@tauri-apps/api/core";
import { create } from "zustand";
import type { DiscoveredProject, Workspace } from "../types";

type WorkspacesState = {
  workspaces: Workspace[];
  selectedId: string | null;
  loading: boolean;
  error: string | null;

  reload: () => Promise<void>;
  add: (path: string, name?: string) => Promise<Workspace>;
  remove: (id: string) => Promise<void>;
  rename: (id: string, name: string) => Promise<void>;
  select: (id: string | null) => void;
  discover: () => Promise<DiscoveredProject[]>;
};

export const useWorkspaces = create<WorkspacesState>((set, get) => ({
  workspaces: [],
  selectedId: null,
  loading: false,
  error: null,

  async reload() {
    set({ loading: true, error: null });
    try {
      const workspaces = await invoke<Workspace[]>("list_workspaces");
      const currentSelected = get().selectedId;
      const stillPresent = workspaces.some((w) => w.id === currentSelected);
      set({
        workspaces,
        loading: false,
        selectedId: stillPresent
          ? currentSelected
          : (workspaces[0]?.id ?? null),
      });
    } catch (e) {
      set({ error: String(e), loading: false });
    }
  },

  async add(path, name) {
    const ws = await invoke<Workspace>("add_workspace", { path, name });
    set((s) => ({
      workspaces: [...s.workspaces, ws],
      selectedId: ws.id,
    }));
    return ws;
  },

  async remove(id) {
    await invoke<boolean>("remove_workspace", { id });
    set((s) => {
      const next = s.workspaces.filter((w) => w.id !== id);
      const nextSel = s.selectedId === id ? (next[0]?.id ?? null) : s.selectedId;
      return { workspaces: next, selectedId: nextSel };
    });
  },

  async rename(id, name) {
    await invoke<boolean>("rename_workspace", { id, name });
    set((s) => ({
      workspaces: s.workspaces.map((w) => (w.id === id ? { ...w, name } : w)),
    }));
  },

  select(id) {
    set({ selectedId: id });
  },

  async discover() {
    return await invoke<DiscoveredProject[]>("discover_workspaces_from_history");
  },
}));
