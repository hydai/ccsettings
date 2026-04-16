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

export const TIER_DOT: Record<LayerKind, string> = {
  managed: "bg-layer-managed",
  user: "bg-layer-user",
  "user-local": "bg-layer-user-local",
  project: "bg-layer-project",
  "project-local": "bg-layer-project-local",
};
