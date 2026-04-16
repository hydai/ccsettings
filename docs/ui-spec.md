# ccsettings — UI specification

> Status: matches implementation at commit `9b4a617`. Source of truth
> for what the app looks like today; input document for design review.

This spec describes **every screen, state, and component** in
ccsettings. Paired reading: `architecture.md` (systems), `edit-flow.md`
(how a save travels to disk), `cascade-rules.md` (merge semantics).

---

## 1. Product context

### 1.1 What ccsettings is

A Tauri 2 desktop app that **visualizes and edits Claude Code
settings** across the five-tier cascade. It reads local JSON and
Markdown files that the user (and Claude Code itself) already
maintain, shows the effective merged configuration, and provides typed
editors that save with atomic writes plus automatic backups.

### 1.2 Primary user

A developer who:

- Has Claude Code installed and has used it at least once.
- May or may not understand the five-tier settings cascade.
- Wants to answer "why is this setting active?" or "how do I turn
  this on just for this project?"

Secondary user: a team lead onboarding Claude Code across a repo and
wanting to share a baseline.

### 1.3 Product goals

1. Make the cascade **visible** — always show which tier supplied
   each value.
2. Make edits **safe** — atomic writes, hash precondition, automatic
   backups, one-click restore.
3. Make the terminology **learnable** — tiers, categories, events
   are explained inline, not hidden in docs.
4. Do the right thing for **power users** — keep full JSON editing
   power; the friendly layer sits on top, not in the way.

### 1.4 Non-goals

- Not a text editor. Raw JSON editing exists only for malformed
  files and unknown keys; everything else is typed.
- Not a sync service. Runs entirely on the user's machine.
- Not a launcher for Claude Code itself.

---

## 2. Information architecture

```
App
├── Sidebar (fixed 256 px)
│   ├── Brand header
│   ├── Workspace list
│   │   ├── Empty state
│   │   ├── Loading
│   │   ├── Error
│   │   └── Populated (clickable rows)
│   ├── Discover panel (collapsible, inline)
│   └── Footer actions (Add workspace, Discover toggle)
│
└── Main pane (flex-1)
    ├── Empty state (no workspace selected)
    │
    └── WorkspacePane (workspace selected)
        ├── Workspace title + path
        ├── CategoryPicker (eight tabs)
        └── CategoryView (renders one of:)
            ├── Overview (CascadeHeader + merged JSON + UnknownKeysPanel)
            ├── Permissions editor
            ├── Env editor
            ├── Model editor
            ├── Memory editor
            ├── Plugins editor
            ├── Hooks editor
            └── MCP editor
```

Every editor (except Overview) follows the same template:

```
CategoryHeader        (title + one-paragraph description)
TierPicker            (radio row + description of selected tier)
Inline help panel     (syntax / event list / examples)
Category-specific UI  (lists, forms, tables)
SaveControls          (Save, Discard, optional conflict banner)
BackupsList           (collapsible drawer)
```

---

## 3. Layout shell

### 3.1 Window

| Property | Value |
|---|---|
| Initial size | 1280 × 800 |
| Min size | 900 × 600 |
| Max size | none |
| Resizable | yes |
| Title | "ccsettings" |

### 3.2 Two-pane layout

- Sidebar: **256 px fixed width**, full height, scrolls internally,
  never resizes with the window.
- Main pane: remaining width, full height, scrolls internally,
  content is capped at `max-w-6xl` (1152 px) and **centered** when
  the window exceeds sidebar + content width. So on a wide monitor
  the user sees empty margin on both sides of the content, not one.

Below the window minimum (900 px) there's no mobile breakpoint —
the sidebar stays 256 px, the main pane gets the remaining 644 px.
Editors remain usable at that width (one-column layout in Overview's
cascade header, stacked inputs elsewhere).

---

## 4. Responsive behavior

ccsettings is desktop-first; there is no phone/tablet layout. The
only responsiveness concerns are window resizing at desktop widths.

| Breakpoint | Behavior |
|---|---|
| < 900 px wide | Prevented by window min-size. |
| 900–1024 px | Tier chips drop the "· subtitle" suffix (keeps chip row on one line). |
| 1024+ px | Tier chips show "User · Just for me" etc. |
| > 1408 px | WorkspacePane content centers with equal margins. |

Height: internal scroll areas (sidebar list, cascade panel, merged
JSON dump, hooks/env/backups lists) handle overflow. No column/row
collapse on short windows.

---

## 5. Design tokens

All tokens live in `src/styles.css` (CSS variables) and
`tailwind.config.ts` (Tailwind extend).

### 5.1 Color — theme tokens

Tokens are light-first with dark overrides via `prefers-color-scheme`
or an explicit `.dark` class on `<html>`.

| Token | Light | Dark | Used for |
|---|---|---|---|
| `--bg` | `#ffffff` | `#0b1120` | Window background |
| `--fg` | `#0f172a` | `#e2e8f0` | Default text |
| `--muted` | `#64748b` | `#94a3b8` | Secondary text, help copy |
| `--surface` | `#f8fafc` | `#0f172a` | Cards, panels, inputs |
| `--border` | `#e2e8f0` | `#1e293b` | Separators, input outlines |
| `--accent` | `#3b82f6` | `#60a5fa` | Primary CTA tint |

Exposed as Tailwind utilities: `.surface`, `.border-default`,
`.text-muted`.

### 5.2 Color — layer (tier) palette

Used for the cascade dots and "effective from X" badges. Shared
between `TierPicker`, `CascadeHeader`, backup badges, and effective
labels.

| Tier | Hex | Tailwind class |
|---|---|---|
| Managed | `#8b5cf6` violet | `bg-layer-managed` |
| User | `#3b82f6` blue | `bg-layer-user` |
| User Local | `#06b6d4` cyan | `bg-layer-user-local` |
| Project | `#10b981` emerald | `bg-layer-project` |
| Project Local | `#f59e0b` amber | `bg-layer-project-local` |

These are **2 px dots** in compact contexts (chip rows) and a
dot + label in expanded contexts.

### 5.3 Semantic colors

| Role | Token | Use |
|---|---|---|
| Error / danger | Tailwind `red-500` family | Parse errors, save errors, remove buttons |
| Warning | Tailwind `amber-500` family | Hook danger-pattern lint, "secrets into project" warning |
| Success | Tailwind `green-600` (20% overlay) | Dirty Save button, effective-enabled plugin/MCP badge |
| Conflict action | Tailwind `red-600/80` | "Overwrite anyway" destructive CTA |

### 5.4 Typography

- **Sans** (default): system stack — `-apple-system, BlinkMacSystemFont,
  "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif`.
- **Mono**: `ui-monospace, SFMono-Regular, Menlo, Consolas, monospace`.

Sizes (Tailwind):

| Size | Use |
|---|---|
| `text-2xl` (24 px) | WorkspacePane title, empty-state headline |
| `text-lg` (18 px) | Sidebar brand title, category header |
| `text-sm` (14 px) | Body text, most inputs, tab labels |
| `text-xs` (12 px) | Secondary/help text, tier subtitles, metadata |
| `text-[10px]` | Timestamp suffixes, column subtitles |

Line-height: default Tailwind; `leading-snug` (1.375) on dense help
blocks.

### 5.5 Spacing

Standard Tailwind 4-px scale. Common patterns:

- Panel padding: `p-3` (12 px).
- Section gap: `mb-6` (24 px).
- Button padding: `px-3 py-1.5` (12×6) or `px-4 py-2` (16×8 for primary CTAs).
- Tier chip padding: `px-2 py-1` (8×4).

### 5.6 Iconography

Lucide icons. Currently used:

| Icon | Use |
|---|---|
| `Plus` | Add workspace, add rule/row |
| `Search` | Discover from history |
| `HelpCircle` | Cascade "What are these tiers?" |
| `History` | Backups drawer toggle |
| `Eye` / `EyeOff` | Env secret reveal |
| `AlertTriangle` | Hooks danger-pattern warning |
| `Loader2` | Discovery spinner |

### 5.7 Corners & borders

- Cards / panels: `rounded` (4 px) or `rounded-lg` (8 px, for card-y
  containers like cascade columns and BackupsList entries).
- Inputs: `rounded` (4 px).
- Buttons: `rounded` (4 px).
- Border width: `border` (1 px) with `border-default`. Error banners
  use `border-red-500/30` (30% alpha).

---

## 6. Component library

Every reusable component lives under `src/components/`. This
inventory describes props, states, and copy.

### 6.1 `TierPicker`

**Purpose.** Pick one of the four writable tiers. Used by every
editor except Memory and Overview.

**Props:**

| Prop | Type | Required | Notes |
|---|---|---|---|
| `value` | `LayerKind` | yes | Current selection |
| `onChange` | `(t: LayerKind) => void` | yes | Selection handler |
| `currentPath` | `string?` | no | Absolute path of the selected tier's file (shown on the right, truncated) |
| `name` | `string?` | no | Radio group name; default `tier-picker` |

**Layout.**

```
┌──────────────────────────────────────────────────────────────┐
│ Write to:  (◉)User · Just for me   (○)User Local · Just for…│
│            (○)Project · Shared…    (○)Project Local · Just m…│
│                                                               │
│ Personal for this project (gitignored; safe for API keys…).   │
└──────────────────────────────────────────────────────────────┘
```

- One row of four chips. Each chip: colored dot + label + subtitle
  (subtitle hidden below `lg` breakpoint to keep the row on one
  line).
- Hovering a chip shows its full `TIER_DESCRIPTION` as a native
  tooltip.
- **Below the chips**, always visible, a muted line shows the
  description of the currently selected tier.
- Far right of the chip row, if `currentPath` is supplied: the
  absolute path of the file this tier writes to, monospace,
  truncated with a title tooltip.

**States.** None — purely controlled.

**Copy.**

| Tier | Label | Subtitle | Description |
|---|---|---|---|
| managed | Managed | Site policy | Site-wide policy set by an administrator. Read-only here; lowest precedence. |
| user | User | Just for me | Applies to every project you work on, across all your machines where you sync ~/.claude. |
| user-local | User Local | Just for me, private | Personal overrides in ~/.claude/settings.local.json — not shared, gitignored by convention. |
| project | Project | Shared with my team | Committed to the project's git repo; shared with anyone who clones it. Don't put secrets here. |
| project-local | Project Local | Just me on this project | Your personal overrides for this specific project. Gitignored — safe for API keys and machine-specific paths. |

### 6.2 `SaveControls`

**Purpose.** Save / Discard buttons plus error/conflict banner.
Every editor renders exactly one.

**Props:**

| Prop | Type | Notes |
|---|---|---|
| `dirty` | `boolean` | Disables both buttons when false |
| `saving` | `boolean` | Replaces Save label with "Saving…" and disables buttons |
| `savedAt` | `number \| null` | When set + not dirty, shows "Saved at 14:02" next to the buttons |
| `saveLabel` | `string` | e.g. "Save to Project Local" |
| `error` | `string? \| null` | Banner content; prefix `conflict:` triggers the conflict variant |
| `onSave` | `() => void` | |
| `onDiscard` | `() => void` | |
| `onForceSave` | `() => void?` | Present → conflict banner shows "Overwrite anyway" |

**Layout — normal:**

```
[Save to Project Local] [Discard changes]     Saved at 14:02
```

**Layout — error (non-conflict):**

```
[Save to Project Local] [Discard changes]

┌─ red border ──────────────────────────┐
│ <error message verbatim>              │
└───────────────────────────────────────┘
```

**Layout — conflict:**

```
[Save to Project Local] [Discard changes]

┌─ red border ───────────────────────────────────────────┐
│ Conflict: the file changed on disk while you were      │
│ editing. Pick one:                                     │
│                                                         │
│ [Discard and reload from disk] [Overwrite anyway]      │
│                                                         │
│ Overwriting still captures a backup of the current     │
│ disk content first — you can restore it from the        │
│ Backups drawer if you change your mind.                │
└────────────────────────────────────────────────────────┘
```

### 6.3 `BackupsList`

**Purpose.** Collapsible drawer showing recent snapshots of the
editor's target file with one-click restore.

**Props:**

| Prop | Type | Notes |
|---|---|---|
| `fetchBackups` | `() => Promise<BackupEntry[]>` | Editor-specific closure — `list_backups_for_layer` or `list_backups_for_memory` |
| `currentHash` | `string \| null` | Restore uses it as the precondition |
| `onRestored` | `() => Promise<void> \| void` | Parent refetches state after restore |

**Closed:**

```
▸ History  Show backups (3)
```

**Open:**

```
▼ History  Hide backups (3)
┌────────────────────────────────────────────────────┐
│ 2s ago · 1.2 KB          7a3fb4…        [Restore]  │
│   backups/5c3a8f…/2026-04-16T14-02…               │
│ 1h ago · 1.1 KB          9a8b01…        [Restore]  │
│ 3d ago · 1.0 KB          2f11cc…        [Restore]  │
└────────────────────────────────────────────────────┘
```

Each entry: relative time-ago, size, 12-char SHA-256 prefix, Restore
button. Hovering a row shows the full backup path and full SHA-256
as a title tooltip. Restore opens a native `confirm()` dialog before
calling the backend.

**States.** Loading (spinner + "Loading…"), empty ("No backups yet.
Each save captures one automatically."), error (red banner; special
copy for conflict errors).

### 6.4 `CascadeHeader`

**Purpose.** Five-column breakdown of which tier contributed which
top-level keys. Shown only in the Overview tab.

**Props:** `merged: MergedView`.

**Closed (default):**

```
Cascade · lowest → highest precedence          ⓘ What are these tiers?
┌──────┬──────┬──────────┬──────┬──────────────┐
│Managed│ User │User Local│Project│Project Local│
│· Site │· Just│· Just for│· Shared│· Just me   │
│pol.  │for me│me priv.  │w team│this proj     │
│                                                │
│—     │env   │effortLev │hooks │env           │
│      │perms │alwaysThk │model │permissions   │
└──────┴──────┴──────────┴──────┴──────────────┘
```

**Open:**

```
Cascade · lowest → highest precedence          ⓘ Hide legend
┌──────────────────────────────────────────────────────────────────┐
│ ● Managed · Site policy                                          │
│   Site-wide policy set by an administrator. Read-only here;      │
│   lowest precedence.                                             │
│ ● User · Just for me                                             │
│   Applies to every project you work on, across all your machines…│
│ ● User Local · Just for me, private                              │
│   Personal overrides in ~/.claude/settings.local.json — not      │
│   shared, gitignored by convention.                              │
│ ● Project · Shared with my team                                  │
│   Committed to the project's git repo; shared with anyone who…   │
│ ● Project Local · Just me on this project                        │
│   Your personal overrides for this specific project. Gitignored… │
│ ───────────────────────────────────────────────────────────────  │
│ Later tiers override earlier ones, except: `hooks` arrays append │
│ across tiers, and `permissions.allow/deny/ask` union (dedup).    │
└──────────────────────────────────────────────────────────────────┘
<grid as shown above>
```

Each column: colored dot + tier label + subtitle under it + sorted
list of top-level keys the tier contributed. Empty columns show "—".

### 6.5 `CategoryPicker`

**Purpose.** Eight-tab bar above the editor content.

**Tabs (in order):** Overview, Permissions, Env, Model, Memory,
Plugins, Hooks, MCP.

**Layout:**

```
Overview  Permissions  Env  Model  Memory  Plugins  Hooks  MCP
────────
```

- Tab separator: 1 px bottom border across the row (`border-default`).
- Active tab: `border-current` on its 2 px bottom border, negative
  margin `-mb-px` so the active tab's border overlays the row border.
- Inactive tabs: muted color, `hover:text-current`.
- Wraps to multiple rows below 900 px wide if needed.

**Accessibility.** `role="tablist"` on the row, `role="tab"` on each
button, `aria-selected={true}` on the active one,
`aria-label="Settings categories"` on the row.

### 6.6 `CategoryHeader`

**Purpose.** Title + description shown at the top of every category
tab's content.

**Props:** `category: Category`.

**Layout:**

```
Permissions
What Claude Code is allowed to do without asking — tool calls,
shell commands, MCP servers. Entries use the pattern Tool(args),
e.g. Bash(git *), WebFetch(*), mcp__pencil.
```

Title is `text-lg font-semibold`. Description is `text-sm text-muted`
capped at `max-w-prose` (~65 chars).

**Copy.** See `CATEGORY_META` in `src/lib/categories.ts`. One label +
description per category.

### 6.7 `UnknownKeysPanel`

**Purpose.** In Overview, lists top-level keys in the merged view
that the app doesn't have a typed editor for. Two sections: "Unknown
keys" (amber border — schema drift) and "Auto-managed" (default
border — $schema, feedbackSurveyState, statusLine, apiKeyHelper).

Each row: key name, value-type summary (`object(4)`, `array(12)`,
`string`, …), an "inspect" toggle that expands to a 48-line-max
`<pre>` with the full JSON.

### 6.8 `DiscoverPanel`

**Purpose.** Inline sidebar panel that imports workspaces from Claude
Code's transcript history.

**Props:** `onClose: () => void`.

**Layout:**

```
┌─ Projects Claude Code has touched ──────────────  [Close] ┐
│ Pulled from ~/.claude/projects/ · 12 available · 3 already │
│ added                                                      │
├────────────────────────────────────────────────────────────┤
│ ☐ /Users/hydai/work/frobnicator                            │
│     4 transcripts · 2 days ago                             │
│ ☑ /Users/hydai/work/gizmo                                  │
│     1 transcript · today                                   │
│ ☐ /Users/hydai/hobby/widget                                │
│     12 transcripts · 3 months ago                          │
│ …                                                          │
├────────────────────────────────────────────────────────────┤
│ 1 selected              [Cancel]  [Import 1]               │
└────────────────────────────────────────────────────────────┘
```

**States.** Loading (spinner + "Reading transcript metadata…"), error
(red banner), empty (italic muted "Nothing new to import. …"),
populated (sticky header + list + sticky footer).

### 6.9 `Sidebar`

**Purpose.** Left pane: brand header, workspace list, Discover panel
toggle, action buttons.

**Layout:**

```
┌────────────────────────┐
│ ccsettings             │
│ Claude Code settings…  │
├────────────────────────┤
│ WORKSPACES             │
│ ▸ proj-a               │
│   /Users/hydai/proj-a  │
│   proj-b               │
│   /Users/hydai/proj-b  │
│ ───────────────────────│
│ (DiscoverPanel here    │
│  when toggled open)    │
├────────────────────────┤
│ + Add workspace        │
│ 🔍 Discover from hist. │
└────────────────────────┘
```

Active workspace row has `bg-black/10` (light) or `bg-white/10`
(dark). Inactive rows are plain with hover highlight.

---

## 7. Screens

Each screen section below specifies: purpose, layout, every rendered
state, and copy.

### 7.1 Empty state (no workspaces)

**When:** First launch, or user has removed all workspaces.

**Sidebar:** The workspace list shows the two-paragraph welcome
copy. Action buttons (Add, Discover) remain at the bottom.

```
WORKSPACES
Add your first project to see the cascade of Claude Code
settings applied to it.

If you've used Claude Code before, the Discover button
below can find your existing projects automatically.
```

**Main pane:** A centered, max-w-xl welcome column:

```
Welcome to ccsettings
A visual companion for Claude Code's layered settings —
see what's effective for each project and edit any tier
safely.

① Add a workspace on the left — pick a folder directly or
  let Discover pull projects Claude Code has already touched.

② Open the Overview tab — a five-tier cascade header shows
  which file supplied every top-level setting.

③ Pick a category to edit — Permissions, Env, Hooks, MCP,
  and four more. Every save writes atomically with a SHA-256
  precondition, and snapshots the prior content in Backups.

Nothing leaves your machine. ccsettings only reads and writes
files you can already edit by hand.
```

### 7.2 Overview tab

**When:** Workspace selected, category `overview`.

**Layout (top to bottom):**

1. WorkspacePane header — workspace name (24 px semibold) + path
   (mono, muted).
2. `CategoryPicker` (eight tabs, `Overview` selected).
3. `CategoryHeader` — "Overview" + description.
4. `CascadeHeader` — cascade section title with legend toggle,
   optional expanded legend, 5-column grid.
5. "Effective merged settings" label + pre-formatted JSON dump of
   `merged.value` (scrollable, max-h `50vh`).
6. `UnknownKeysPanel` (conditional — only if there are unknown or
   auto-managed keys).

### 7.3 Permissions tab

**Layout:**

1. Common shell (WorkspacePane + CategoryPicker + CategoryHeader).
2. `TierPicker`.
3. Loading / parse-error states (see §8).
4. Three `RuleList` sections in order: `allow`, `deny`, `ask`. Each
   shows a section label + count, then a list of rule rows, or
   "empty" placeholder.
5. Add-rule form — kind select + pattern input + Add button — plus
   a one-paragraph syntax primer immediately below the form.
6. `SaveControls`.
7. `BackupsList`.

**Rule row:**

```
┌─────────────────────────────────────────────┐
│ Bash(git *)                           [  × ]│
└─────────────────────────────────────────────┘
```

Mono text, `overflow: hidden` with `truncate`, title tooltip showing
the full rule.

### 7.4 Env tab

**Layout:** shell + TierPicker + help box + (optional) secret-warning
banner + list of `Entry` rows + `[+ Add variable]` button +
SaveControls + BackupsList.

**Entry row:**

```
┌──────────────────────────────────────────────────────┐
│ [KEY_NAME        ] [value or ••••••]  👁  ×          │
└──────────────────────────────────────────────────────┘
```

- Key input: 224 px wide, mono.
- Value input: flex-1, type=`password` if key matches the secret
  regex and reveal is off; type=`text` otherwise.
- Eye toggle: only renders for secret-looking keys.
- Remove `×` button on the right.

**Secret warning banner** (amber, conditional): "Heads up: the
Project tier is typically committed to git. Secrets (keys matching
TOKEN|KEY|SECRET|PASSWORD|API) should live in Project Local or User
Local instead."

### 7.5 Model tab

**Layout:** shell + TierPicker + five `FieldShell` sections (one per
field) + SaveControls + BackupsList.

**FieldShell:**

```
┌ model                                         clear ─┐
│ Model ID. Overrides what Claude Code uses by default.│
│ [opus▾ (with datalist)                             ] │
└──────────────────────────────────────────────────────┘
```

Fields:
1. `model` — text input with datalist (opus, sonnet, haiku,
   claude-opus-4-6, claude-sonnet-4-6, claude-haiku-4-5-20251001).
2. `outputStyle` — text input with datalist (default, learning,
   explanatory, concise).
3. `effortLevel` — select (empty=inherit, low, medium, high, max).
4. `alwaysThinkingEnabled` — 3-state button row (inherit, true,
   false).
5. `includeCoAuthoredBy` — 3-state button row.

"Clear" link on each field removes the key at this tier (sets to null
in the draft).

### 7.6 Memory tab

**Layout:** shell + scope/file picker + help box + (optional) "will
create" notice + textarea + SaveControls + BackupsList.

**Scope/file picker:**

```
Scope: [User (~/.claude/)] [Project root]
File:  [CLAUDE.md] [AGENTS.md] [GEMINI.md]    ~/path/to/CLAUDE.md
```

Both are pill-button rows. The selected scope + file combination
resolves to a path shown truncated on the right.

**"Will create" notice:** "This file does not exist yet. Saving will
create it at `<path>`."

**Textarea:** full-width, `min-h-[40vh]`, resizable-y, monospace. On
empty files, a placeholder:

```
# Project memory

Write instructions Claude Code should always see for this scope.
```

### 7.7 Plugins tab

**Layout:** shell + TierPicker + list of installed plugins +
SaveControls + BackupsList.

**Plugin row:**

```
┌─────────────────────────────────────────────────────────┐
│ superpowers@superpowers-mk                              │
│ v5.0.7 · user              [effective: on]  [  On     ]│
└─────────────────────────────────────────────────────────┘
```

- Name and marketplace, mono; version + scope in muted metadata.
- "effective: on/off/not set" badge derived from cascade, colored by
  state (green/red/muted). Tooltip: "From Project Local".
- 112 px tri-state button: cycles `(inherit) → On → Off → (inherit)`.
  Colored based on draft value: green = On, red = Off, muted =
  inherit.

**Empty state:** "No plugins installed. Claude Code tracks installs
in `~/.claude/plugins/installed_plugins.json`."

### 7.8 Hooks tab

**Layout:** shell + TierPicker + comprehensive help panel + list of
`HookRow`s + `[+ Add hook]` + SaveControls + BackupsList.

**HookRow:**

```
┌─────────────────────────────────────────────────────────┐
│ [PreToolUse▾] [Bash|Write                          ] × │
│ ┌────────────────────────────────────────────────────┐ │
│ │ echo "$TOOL_INPUT" | jq '.tool_name'               │ │
│ │ if echo "$TOOL_INPUT" | grep -q 'rm -rf'; then     │ │
│ │   exit 1                                           │ │
│ │ fi                                                 │ │
│ └────────────────────────────────────────────────────┘ │
│ ⚠ Heads up: command contains recursive/force rm. Make  │
│   sure this is intentional.                            │
└─────────────────────────────────────────────────────────┘
```

- Event: 160 px text input with datalist of the nine known events.
- Matcher: flex-1 text input.
- Remove `×` button.
- Command: multiline textarea, auto-grows 2–8 rows, monospace.
- Danger-pattern warning (amber, conditional): rendered below the
  textarea when the command matches any of six regexes.

### 7.9 MCP tab

**Layout:** shell + TierPicker + "Project-scope servers" section +
"User-scope servers (read-only)" section + SaveControls + BackupsList
+ footnote.

Each section has a heading + a path hint on the right + a list of
server rows.

**Server row:**

```
┌─────────────────────────────────────────────────────────┐
│ pencil                                                  │
│ stdio · node ./srv.js                                   │
│                             [effective: on]  [ On      ]│
└─────────────────────────────────────────────────────────┘
```

- Name, mono.
- Description line: `<type> · <command args>` or `<type> · <url>`
  depending on transport.
- Effective badge + tri-state button (same semantics as Plugins).

**Footnote:** "Server definitions (command, args, URL, …) aren't
editable from ccsettings in v1 — edit `<path>` or Claude Code's own
config directly. Toggles above only update the
`enabledMcpjsonServers` / `disabledMcpjsonServers` arrays in the
selected tier's `settings.json`."

---

## 8. Screen states matrix

Every editor screen can be in one of these states. Consistent copy
across all eight:

| State | When | Visible UI |
|---|---|---|
| **Loading** | Initial fetch in flight | "Loading tier…" or "Loading plugins…" in muted text. Rest of the editor content hidden. |
| **Error** (non-conflict) | Any non-conflict error from the fetch | Red banner with the error message. Editor content hidden. |
| **Parse error** | Tier file exists but isn't valid JSON | Red banner: "This tier's file could not be parsed: &lt;serde error&gt;. Editing is disabled until the file is fixed." Editor content hidden. |
| **Empty** | Tier file has no relevant keys | Section-specific empty placeholders ("empty", "no variables at this tier", "no hooks at this tier"). |
| **Clean** | Loaded, no user edits | All inputs prefilled, Save disabled. |
| **Dirty** | User has changed something | Save enabled (blue), Discard enabled. |
| **Saving** | `save_layer` / `save_memory_file` in flight | "Saving…" on the Save button; both buttons disabled. |
| **Saved** | Save succeeded, state clean | Save/Discard disabled, "Saved at HH:MM:SS" next to buttons. Stays until next edit. |
| **Conflict** | `Err("conflict:…")` returned | Specialized banner with "Discard and reload from disk" + "Overwrite anyway" buttons. |
| **Restoring** | Backups drawer restore in flight | Row button shows "Restoring…"; all other rows dimmed. |

Shared loading-state copy: "Loading tier…", "Loading MCP state…",
"Loading file…".

---

## 9. User flows

### 9.1 First-run onboarding

1. User launches ccsettings. Sidebar has brand header + empty
   workspace list + Add/Discover buttons at the footer. Main pane
   shows the welcome screen with three-step quickstart.
2. User clicks **Discover from history** (recommended path for
   existing Claude Code users). DiscoverPanel expands inline in the
   sidebar. Spinner → list of candidates sorted by recency.
3. User checks one or more rows, clicks **Import N**. Each row
   becomes a workspace entry via `add_workspace`. Panel closes. The
   first imported workspace is auto-selected.
4. Main pane transitions to the Overview tab for the selected
   workspace. Cascade header and merged JSON render.

Alternative flow: user clicks **Add workspace** instead; native
folder picker opens; chosen folder becomes a workspace.

### 9.2 Edit permissions at Project Local

1. User selects workspace, clicks **Permissions** tab.
2. CategoryHeader explains what Permissions controls. TierPicker
   defaults to Project Local; description updates accordingly.
3. User reads the three lists (allow / deny / ask) populated from
   the target tier.
4. In the add form at the bottom, user picks `allow`, types
   `Bash(npm run *)`, clicks **Add**. Row appears at the end of the
   allow list; Save button activates (blue).
5. User clicks **Save to Project Local**. Button shows "Saving…".
   On success, Save disables, "Saved at HH:MM:SS" appears, cascade
   reloads.
6. Overview tab now shows `permissions` in the Project Local
   column of the cascade header.

### 9.3 Conflict resolution

1. User is editing a tier. They've typed a new rule but haven't
   saved.
2. User (or Claude Code, or another editor) modifies the same file
   on disk.
3. User clicks Save. Backend returns `Err("conflict:…")`. Frontend
   shows the conflict banner with two buttons.
4. User picks:
   - **Discard and reload from disk** → editor refetches. Their
     unsaved rule is gone.
   - **Overwrite anyway** → editor re-saves with `expected_hash:
     null`. The external change is captured as the newest entry in
     Backups; user can restore it from the Backups drawer.

### 9.4 Restore a backup

1. User makes a save they later regret.
2. User opens the Backups drawer below SaveControls. Sees the
   snapshot captured immediately before the bad save (now the
   second-newest entry).
3. User clicks **Restore** on that entry. Native confirm dialog:
   "Restore this backup? The current file will be overwritten. A
   fresh backup of the current content is captured first."
4. User confirms. Backend runs `restore_backup`, which does a
   hash-preconditioned write. Editor refetches; Backups drawer
   reloads and shows the pre-restore state now at the top.

---

## 10. Copy inventory

Key user-facing strings grouped by locus. This is not exhaustive —
for every label see the component source.

### 10.1 Brand and navigation

- Sidebar title: "ccsettings"
- Sidebar subtitle: "Claude Code settings inspector"
- Workspace list heading: "WORKSPACES" (uppercase, muted)
- Add workspace: "+ Add workspace"
- Discover toggle: "🔍 Discover from history" / "Hide discovery"

### 10.2 Empty-state welcome

See §7.1.

### 10.3 Category descriptions

See `src/lib/categories.ts` — one paragraph per tab, already listed
in §7 above.

### 10.4 Tier descriptions

See §6.1 copy table.

### 10.5 Action verbs (standardized)

- "Save to <Tier>" — primary CTA on editors.
- "Discard changes" — revert to last loaded state.
- "Overwrite anyway" — force save, bypass precondition.
- "Discard and reload from disk" — conflict resolution option 1.
- "Restore" — apply a backup.
- "Add" — one row / one rule.
- "+ Add variable" / "+ Add hook" / "+ Add workspace" — multi-word
  additions carry the `+` prefix on the button.
- "Close" / "Cancel" — dismiss without action.
- "Import N" — apply a discover selection.
- "Inspect" / "Hide" — toggle an expandable.

### 10.6 Status phrases

- "Saved at HH:MM:SS"
- "Saving…"
- "Restoring…"
- "Loading tier…" / "Loading file…" / "Loading plugins…" /
  "Loading MCP state…"
- "No backups yet. Each save captures one automatically."
- "no variables at this tier" / "no hooks at this tier" / "empty"
  (per-list empties).

---

## 11. Accessibility

Current state — honest assessment so the designer can see what
needs attention.

### 11.1 Shipped

- `role="tablist"` / `role="tab"` on CategoryPicker with
  `aria-selected` and `aria-label`.
- `aria-expanded` on Backups drawer, Discover panel toggle,
  cascade legend toggle.
- `aria-label` on remove / reveal / restore buttons.
- `title` tooltips on tier chips, cascade columns, workspace
  rows, backup entries — discoverable semantics on hover.
- Native form controls (radio, checkbox, input, textarea) are
  used everywhere; no custom controls that need ARIA roles.
- `sr-only` on the actual radio input in TierPicker chips; the
  visible chip is the clickable `<label>` and keyboard-focusable
  via the hidden radio.

### 11.2 Known gaps

- **Focus indicators** — using browser defaults, not a designed
  focus ring. Inconsistent across Tailwind button classes.
- **Keyboard-only flows** — not formally tested. The Sidebar list
  is a sequence of buttons (Tab should step through them); editors
  are mostly natural tab order but a few custom button groups
  (tri-state plugin/mcp toggles) might trap focus oddly.
- **Color contrast** — not validated against WCAG AA. Muted text
  on surface background hasn't been measured. The layer-color
  dots are purely decorative so the colored-dot-as-signifier
  problem is mitigated (the tier label is always rendered next
  to the dot).
- **Motion** — there are very few transitions, but no respect for
  `prefers-reduced-motion` anywhere.
- **Screen-reader experience** — untested.

### 11.3 Design-review questions

- Focus ring style? (Solid, outline, shadow?)
- Hit-target minimums for the tri-state plugin buttons (currently
  112 px × 32 px)?
- Whether to replace `title` tooltips with an accessible tooltip
  primitive (they're not keyboard-reachable today).

---

## 12. Open questions

Items where the current implementation took one reasonable choice
but there's a real design decision in front of you:

1. **Content width cap.** Main-pane content is capped at 1152 px
   and centered. Useful on 4K+ monitors to keep readable line
   lengths, but some users want to use the full width for
   wide-table categories (MCP with long command lines, Overview's
   merged JSON). Should the cap be a user preference? Category-
   specific? Dropped entirely?
2. **Light vs dark.** Currently follows `prefers-color-scheme`
   with no explicit toggle. Toggle in a settings menu?
3. **Category label alias.** "Env" is techy; users called it
   "Environment variables" in some tests. We currently use the
   short name as the tab and the long name as the section title.
   Good enough?
4. **Tier picker layout.** A four-chip row doesn't scale to >4
   tiers (we have five — Managed is read-only). Should Managed
   appear as a disabled chip so users understand it exists?
5. **Overview merged JSON.** Plain `<pre>` is fast but a proper
   JSON tree view with collapse/expand and origin badges per
   leaf would be higher-value. Worth the complexity?
6. **Backups drawer density.** One row per snapshot at ~44 px
   tall. After a heavy editing day users may have 30+ rows for
   one file. Group by day?
7. **Conflict banner tone.** Currently very text-heavy. A lighter
   banner with "Overwrite" as a destructive button and a link to
   docs for the full rationale?
8. **Empty-state imagery.** Today it's pure text. Would an
   illustration of the cascade help comprehension?

---

## 13. Change log

- **2026-04-16** (`9b4a617`): Inline syntax hints added to
  Permissions/Hooks/Env/Memory.
- **2026-04-16** (`5ef9b35`): Welcome EmptyState + Discover panel
  wired.
- **2026-04-16** (`fc0ac5f`): CategoryHeader with descriptions.
- **2026-04-16** (`9091e0d`): Tier subtitles + cascade legend.
- **2026-04-16** (`4462aa4`): WorkspacePane now resizes with window.
- **2026-04-16** (`cb2c79d`): Conflict banner with
  Discard/Overwrite actions.
- **2026-04-16** (`01547c2`): UnknownKeysPanel in Overview.
- **2026-04-16** (`40ed8ad`): BackupsList drawer in every editor.
- **2026-04-16** (`2877c2e`): CategoryPicker tabs.
- **2026-04-16** (`d83b5a7`): AppShell + Sidebar + workspace list.
- **2026-04-16** (`0dd3d0a`): Tailwind + deps bootstrap.
