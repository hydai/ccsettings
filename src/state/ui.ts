import { create } from "zustand";

export type Category =
  | "overview"
  | "permissions"
  | "env"
  | "model"
  | "memory"
  | "plugins"
  | "hooks"
  | "mcp";

export type View = "workspace" | "about";

type UiState = {
  category: Category;
  view: View;
  setCategory: (c: Category) => void;
  setView: (v: View) => void;
};

export const useUi = create<UiState>((set) => ({
  category: "overview",
  view: "workspace",
  setCategory: (category) => set({ category }),
  setView: (view) => set({ view }),
}));
