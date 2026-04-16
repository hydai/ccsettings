import type { LayerKind } from "../types";

/** Tiers the app will write to. Managed is read-only for v1. */
export const WRITABLE_TIERS: LayerKind[] = [
  "user",
  "user-local",
  "project",
  "project-local",
];

export const TIER_LABEL: Record<LayerKind, string> = {
  managed: "Managed",
  user: "User",
  "user-local": "User Local",
  project: "Project",
  "project-local": "Project Local",
};

/** Short one-phrase summary, suitable under a chip label. */
export const TIER_SUBTITLE: Record<LayerKind, string> = {
  managed: "Site policy",
  user: "Just for me",
  "user-local": "Just for me, private",
  project: "Shared with my team",
  "project-local": "Just me on this project",
};

/** Full sentence explaining when to pick this tier. */
export const TIER_DESCRIPTION: Record<LayerKind, string> = {
  managed:
    "Site-wide policy set by an administrator. Read-only here; lowest precedence.",
  user: "Applies to every project you work on, across all your machines where you sync ~/.claude.",
  "user-local":
    "Personal overrides in ~/.claude/settings.local.json — not shared, gitignored by convention.",
  project:
    "Committed to the project's git repo; shared with anyone who clones it. Don't put secrets here.",
  "project-local":
    "Your personal overrides for this specific project. Gitignored — safe for API keys and machine-specific paths.",
};

export const TIER_DOT: Record<LayerKind, string> = {
  managed: "bg-layer-managed",
  user: "bg-layer-user",
  "user-local": "bg-layer-user-local",
  project: "bg-layer-project",
  "project-local": "bg-layer-project-local",
};
