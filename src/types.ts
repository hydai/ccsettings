/**
 * Frontend-side mirrors of the Rust DTOs in `src-tauri/src/commands.rs`.
 * Keep these shapes in sync with the serde Serialize derives there.
 */

export type Workspace = {
  id: string;
  name: string;
  /** Display form of the path (forward slashes on all platforms). */
  path: string;
  /** RFC3339 timestamp. */
  added_at: string;
};

export type DiscoveredProject = {
  slug: string;
  slug_dir: string;
  cwd: string | null;
  last_active_unix_millis: number | null;
  transcript_count: number;
};
