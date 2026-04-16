import { invoke } from "@tauri-apps/api/core";
import type { LayerKind } from "../types";

export type LayerFile = {
  layer: LayerKind;
  path: string;
  exists: boolean;
  content: unknown;
  parse_error: string | null;
  hash: string | null;
};

export async function getLayerContent(
  workspaceId: string,
  layer: LayerKind,
): Promise<LayerFile> {
  return invoke<LayerFile>("get_layer_content", { workspaceId, layer });
}

export async function saveLayer(args: {
  workspaceId: string;
  layer: LayerKind;
  newValue: unknown;
  expectedHash: string | null;
}): Promise<LayerFile> {
  return invoke<LayerFile>("save_layer", args);
}
