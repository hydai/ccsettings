# Cascade merge rules

Claude Code's settings come from up to five files at different
precedence levels. ccsettings merges them left-to-right and attributes
every leaf value back to the tier that contributed it. This document
is the single source of truth for that merge — the engine in
`src-tauri/src/cascade.rs` and the golden fixtures under
`src-tauri/tests/fixtures/cascade/` implement and verify these rules.

## Precedence order

Lowest → highest:

1. **Managed** — site-wide policy file (platform-specific path)
2. **User** — `~/.claude/settings.json`
3. **UserLocal** — `~/.claude/settings.local.json` (gitignored personal overrides)
4. **Project** — `PROJECT/.claude/settings.json` (committed)
5. **ProjectLocal** — `PROJECT/.claude/settings.local.json` (gitignored personal overrides)

Later tiers override earlier ones for scalars and deep-merged objects.
Arrays follow special rules (below).

## Rule table

| Path pattern | Rule | Rationale |
|--------------|------|-----------|
| `/hooks/<Event>` (array) | **APPEND** | Multiple layers can register hooks for the same event; all fire. |
| `/permissions/allow` | **UNION** (stable-dedup) | Permissions accumulate across tiers. |
| `/permissions/deny` | **UNION** (stable-dedup) | Security: a deny at any layer is respected. |
| `/permissions/ask` | **UNION** (stable-dedup) | Prompts accumulate. |
| `/enabledMcpjsonServers` | **UNION** | MCP activation accumulates. |
| `/disabledMcpjsonServers` | **UNION** | MCP deactivation accumulates. |
| `/enabledPlugins/<key>` | Later-wins (scalar) | Disable at higher precedence wins. |
| `/mcpServers/<name>` | Later-wins (object) | Explicit override of a user-scope definition. |
| Any other object | Deep-merge (later-wins on leaf) | e.g. `env.X` can be overridden while `env.Y` is preserved. |
| Any other array | Later-wins (replace whole array) | Default for unrecognized arrays. |
| Any scalar | Later-wins | Default. |

### "Stable-dedup" union

When unioning an array across layers, items already present by value
equality are skipped. Order is preserved: lowest-precedence layer's
items come first; later layers append new items only.

### "Append"

For `hooks.<Event>[]`, every layer's entries are concatenated in
precedence order. No dedup — two layers can register the same matcher
with different commands and both fire.

## Output shape

The merge engine produces a `MergedView`:

```json
{
  "value": <the effective merged JSON>,
  "origins": {
    "<JSON Pointer path>": [
      { "layer": "user", "value": <raw>, "overridden": true },
      { "layer": "project-local", "value": <raw>, "overridden": false }
    ]
  }
}
```

`origins[path]` is an ordered stack of every contribution at that path,
earliest first. The last `overridden: false` entry is the effective
source. For APPEND and UNION arrays, individual array items are tracked
at their numeric path (`/permissions/allow/0`, `/hooks/PreToolUse/3`);
each item has a single non-overridden contributor (since they're
preserved in the output).

## JSON Pointer escaping

Per RFC 6901, object keys with `/` or `~` are escaped as `~1` and `~0`
respectively. `escape_json_pointer_segment` handles both.

## Edge cases

- **Missing files** → `Absent` layer, contributes nothing.
- **Malformed JSON** → `ParseError` layer, contributes nothing but is
  visible to the UI so users can fix the file.
- **Non-object top-level** → skipped with a `tracing::warn!`. Claude
  Code's settings.json is always an object by contract.
- **Type mismatch across layers** (e.g. `permissions.allow` is a string
  in one layer and an array in another) → later-wins replace; earlier
  contributors are marked `overridden: true`.
- **Empty special-case arrays on save** → the editors drop
  `allow: []`, `permissions: {}`, `env: {}` entirely rather than
  leaving stub objects. See `buildNewValue` in each editor.

## Tests

- Unit tests in `src-tauri/src/cascade.rs` (15 cases) cover each rule
  plus override marking, 5-tier ordering, and JSON Pointer escaping.
- Golden fixtures in `src-tauri/tests/fixtures/cascade/` (10 cases)
  cover realistic end-to-end merges. Each fixture has up to five
  `layers/*.json` files and an `expected.json`.
