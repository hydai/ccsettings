# Edit flow

How a settings change travels from a user click to bytes on disk, with
safety checks at each step.

## Sequence

```
  User clicks "Save"
        |
        v
+------------------+     invoke("save_layer" / "save_memory_file")
|  React editor    | --------------------------------------------+
|  (Permissions,   |                                             |
|   Env, Model,    |                                             v
|   Hooks, ...)    |                                     +---------------+
+------------------+                                     |  Rust command |
        ^                                                |  save_layer / |
        |                                                |  save_memory  |
        | 3-way branch based on                          +-------+-------+
        | Result<T, String>:                                     |
        |   Ok(LayerFileDto)   -> update snapshot + hash         |
        |   Err("conflict:")   -> show Discard/Overwrite banner  |
        |   Err(other)         -> show error banner              v
        |                                                +---------------+
        |                                                |   writers::   |
        |                                                |   atomic_     |
        |                                                |   write_if    |
        |                                                +-------+-------+
        |                                                        |
        |    1. If expected_hash is Some: read current file,     |
        |       compute sha256, compare. Mismatch => HashMismatch.
        |    2. Call backup::backup_before_write(target) to      |
        |       snapshot prior content.                          |
        |    3. Create parent dir if missing.                    |
        |    4. Open tempfile::NamedTempFile in same parent dir. |
        |    5. Write bytes, fsync, persist (atomic rename).     |
        |    6. Return new SHA-256.                              |
        |                                                        v
        |                                             +------------------+
        |                                             |  backup::        |
        |                                             |  backup_before_  |
        |                                             |  write           |
        |                                             +--------+---------+
        |                                                      |
        |                                                      v
        |                                    Snapshot to <data_dir>/ccsettings/
        |                                    backups/<path-hash>/<iso>.bak
        |                                    Prune old entries (>50 files
        |                                    AND >7 days).
        |                                                      |
        +------------------------------------------------------+
             On success: editor re-fetches, updates hash,
             invalidates cascade, reloads header + overview.
```

## Invariants

- **Expected-hash gate**: every editing save sends the SHA-256 of the
  file the editor loaded. The writer refuses if the on-disk hash has
  drifted. Missing file with expected_hash = Some is also a mismatch
  (someone deleted the file under us).
- **Atomic rename**: we never leave the target half-written. Writes
  land in a same-directory tempfile first, get `fsync`ed, then are
  renamed over the target via `tempfile::persist`. On Windows this
  delegates to `MoveFileEx` which is atomic on NTFS.
- **Backup-before-write**: every successful write captures the prior
  content. Users can always restore via the Backups drawer in the
  editor, even after an "Overwrite anyway" force-save.
- **No edit-session tokens**: the frontend owns the snapshot hash. The
  backend is stateless with respect to in-flight edits.
- **Unrelated keys round-trip**: each editor's `buildNewValue` spreads
  the loaded tier's JSON as the base and only replaces the category's
  subtree. Keys the app doesn't recognize (see Unknown-keys panel)
  are preserved untouched.

## Conflict resolution

When the hash check fails, the command returns a string starting with
`"conflict:"`. `SaveControls` detects that prefix and renders an
actionable banner with:

1. **Discard and reload from disk** — calls the editor's
   `onDiscard`, which re-runs the initial load (`getLayerContent` or
   `readMemoryFile`). The user's in-memory draft is lost.
2. **Overwrite anyway** — calls the editor's `save(force=true)`,
   which re-invokes the command with `expected_hash = None`. The
   writer's backup step still captures the disk state first, so the
   overwrite is still recoverable.

The banner also reminds users that the prior disk content is safe in
Backups — they can restore it if "Overwrite anyway" was a mistake.

## Memory files

`save_memory_file` follows the same flow. The file is UTF-8 text
(not JSON), but the hash precondition, atomic write, and backup
integration are identical.

## What happens on first save (target doesn't exist)

- `get_layer_content` returns `{ exists: false, hash: null, ... }`.
- `save_layer` is called with `expected_hash: null`.
- `atomic_write_if` sees no expected hash, creates parent dirs,
  writes the tempfile, persists atomically.
- `backup_before_write` returns `Ok(None)` — no prior content to
  snapshot — and does nothing.
- After save, the new hash is the editor's snapshot going forward.

## What happens on restore

- User clicks Restore on a backup entry.
- Frontend calls `restore_backup(backup_id, expected_hash)`.
- Rust resolves the backup path, reads its bytes, reads
  `<backup-dir>/source.txt` to find the target path, and calls
  `atomic_write_if(target, bytes, expected_hash)`.
- `backup_before_write` runs first — current disk content becomes
  the newest snapshot before being overwritten. So "restore backup A"
  followed by "restore backup B" lets the user ping-pong safely.
