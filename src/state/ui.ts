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

type UiState = {
  category: Category;
  setCategory: (c: Category) => void;
};

export const useUi = create<UiState>((set) => ({
  category: "overview",
  setCategory: (category) => set({ category }),
}));
