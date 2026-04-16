import { create } from "zustand";

export type Theme = "light" | "dark";

const STORAGE_KEY = "ccsettings:theme";

function applyClass(t: Theme) {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  if (t === "dark") root.classList.add("dark");
  else root.classList.remove("dark");
}

function persist(t: Theme) {
  try {
    localStorage.setItem(STORAGE_KEY, t);
  } catch {
    // storage quota or private-mode restrictions — silently skip persistence.
  }
}

/** Read whatever the pre-React inline script in index.html already applied.
 *  That script runs before CSS paints, so the DOM class is the source of
 *  truth at module-load time. */
function initialTheme(): Theme {
  if (typeof document === "undefined") return "light";
  return document.documentElement.classList.contains("dark") ? "dark" : "light";
}

type ThemeState = {
  theme: Theme;
  toggle: () => void;
  setTheme: (t: Theme) => void;
};

export const useTheme = create<ThemeState>((set, get) => ({
  theme: initialTheme(),
  toggle() {
    const next: Theme = get().theme === "light" ? "dark" : "light";
    applyClass(next);
    persist(next);
    set({ theme: next });
  },
  setTheme(t) {
    applyClass(t);
    persist(t);
    set({ theme: t });
  },
}));
