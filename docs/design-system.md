# Soft Bento — ccsettings design system

The canonical source of Soft Bento is the Pencil file
`ccsettings-ui.pen`, frame `IT54D` (Soft Bento · Design System). This
document is a text mirror for implementers who can't open Pencil, and
the contract between the designer and the code under
`src/components/ui/` + `tailwind.config.ts`.

> Two surfaces, three radii, one shadow. Everything else is restraint
> — a paper-warm canvas, a taupe bento that holds soft white cards,
> and one inverse block for the things that matter most.
> — _.pen frame IT54D cover_

## 1. Principles

1. **Restraint.** Three radii + pill, one elevation (`shadow-soft`),
   four fonts, a warm single-theme palette. Every component composes
   from these; nothing invents its own.
2. **Surfaces earn their elevation.** Cream canvas is free. Taupe
   pads group section clusters. White cards cost a shadow — they
   carry the primary content. Dark `#1A1A1A` is reserved for things
   you genuinely need to notice (save bar, primary CTAs).
3. **Motion is minimal.** Only `transition-colors` and a single
   `rotate-180` chevron. No slide-ins, no parallax, no springs.
4. **Tier colour is decorative.** Never rely on tier colour alone
   to convey meaning — always pair the 10 px dot with a label.

## 2. Tokens

See `docs/ui-spec.md §5.1–5.7` for the authoritative tables. Cheat
sheet:

### Colour

| Token | Hex | Role |
|---|---|---|
| `canvas` | `#F3EBE2` | App background, cream helper surfaces |
| `pad` | `#C5BEB6` | Taupe section wrappers |
| `card` | `#FFFFFF` | Elevated white content cards |
| `ink` | `#1A1A1A` | Primary text, primary CTA, save bar |
| `ink-alt` | `#2D2926` | Dark inverse accent |
| `body` | `#3D3D3D` | Body copy |
| `muted` | `#6B6B6B` | Secondary / help copy |
| `caption` | `#8C8782` | Section labels (`§ 01 —`) |
| `accent` | `#7D6B3D` | Olive accent |
| `conflict` | `#7F1D1D` | Save bar CONFLICT state |
| `danger` | `#B23A3A` | Destructive button outline |
| `danger-soft` | `#B4301F` | Input error outline & copy |
| `hairline` | `#0000001f` | 1 px strokes |

Tier dot palette (from `tailwind.config.ts` `colors.layer`):
`managed #7C5CE0`, `user #6BA3FF`, `user-local #2DB3A0`,
`project #D97A37`, `project-local #C45183`.

### Shape & elevation

- `rounded-soft-sm` 10 px — inputs, env rows, inner chips
- `rounded-soft-md` 12 px — cards-in-cards, save bar, cascade columns
- `rounded-soft-lg` 16 px — content cards
- `rounded-soft-xl` 20 px — outer shell pads
- `rounded-full` — all buttons, chips, tags
- `shadow-soft` `0 1px 2px #0000000a` — the single elevation
- `shadow-lift` `0 2px 8px #1a1a1a33` — active tier pill only
- `shadow-focus-ink` `0 0 0 3px #1a1a1a14` — focus ring

### Typography

Loaded from Google Fonts in `index.html`. Tailwind utilities:

- `font-display` — Playfair Display — brand wordmark, welcome
- `font-sans` — Geist — default UI text, chip labels, buttons
- `font-body` — Inter — paragraphs, descriptions, help notes
- `font-mono` — Geist Mono — paths, rules, JSON, `§` captions

## 3. Primitives

Every primitive is under `src/components/ui/`. Import from the barrel:

```tsx
import { Button, Card, Chip, Input, Textarea, SectionLabel, HelpNote } from "./ui";
```

### Button

```tsx
<Button variant="primary" size="md" shortcut="⌘S">Save</Button>
<Button variant="secondary">Restore</Button>
<Button variant="ghost" size="sm">Cancel</Button>
<Button variant="destructive">Remove</Button>
<Button variant="primary" iconOnly aria-label="Add"><Plus /></Button>
```

All buttons are pill-shaped (`rounded-full`). Variants: `primary`
(ink fill), `secondary` (hairline outline on card), `ghost`
(transparent), `destructive` (danger outline on card). `shortcut`
renders a mono chip inside the button — only shows in primary
buttons today. `iconOnly` switches to a square-pill (32 / 40 px).

### Card

```tsx
<Card variant="soft" className="p-5">…</Card>       // white + shadow, radius 12
<Card variant="cream" className="p-7">…</Card>      // cream + shadow, radius 16
<Card variant="pad" className="p-12">…</Card>       // taupe, radius 16
<Card variant="inverse" className="p-8">…</Card>    // ink, radius 12
```

Padding stays up to consumers — the primitive only supplies the
surface. Default variant is `soft`.

### Chip

```tsx
<Chip dot="bg-layer-user">User</Chip>
<Chip variant="active" dot="bg-layer-user" trailing={<Check />}>User</Chip>
<Chip variant="tier-tag" className="bg-layer-user/20">User</Chip>
```

Variants: `neutral` (white + hairline), `active` (ink + lift shadow),
`tier-tag` (used for the source-tag on env rows — background comes
from className override).

### Input & Textarea

```tsx
<Input placeholder="KEY" />
<Input error placeholder="bad value" />
<Textarea rows={4} placeholder="…" />
```

Both use cream-on-white styling (`bg-card` + 1 px `border-hairline`)
with an ink 1.5 px focus border plus `shadow-focus-ink` spread. Error
state uses a `border-danger-soft` outline. `forwardRef` compatible.

### SectionLabel

```tsx
<SectionLabel>§ Permissions</SectionLabel>
```

The Geist Mono 10 px uppercase caption used above every editor
section title.

### HelpNote

```tsx
<HelpNote>Syntax: …</HelpNote>
```

The 11 px Inter muted paragraph used after every form.

## 4. Pen frame reference map

Drilling into these via `mcp__pencil__batch_get` returns the exact
design spec for each component.

| ccsettings surface | .pen frame ID | Frame name |
|---|---|---|
| Design system cover | `IT54D` | Soft Bento · Design System |
| Foundations cluster | `xEVEh` | 1 · Foundations |
| Surfaces & containers | `JREFw` | 2 · Surfaces & Containers |
| Buttons & interactive | `NIjDi` | 3 · Buttons & Interactive |
| Primary buttons | `oa5mT` | pRow |
| Secondary buttons | `jFkNG` | sRow |
| Segmented tabs | `SJFuk` | tStack |
| Forms & inputs | `U41Pu` | 4 · Forms & Inputs |
| Text input states | `O9aww` | textInputCard |
| Tier picker card | `z9WiJ` | tierPickerCard |
| Tier pills | `gG8Vz` | tierPills |
| Env rows | `sW5mH` | envCard |
| Navigation & shell | `JNcoU` | 5 · Navigation & Shell |
| App shell | `fxE8F` | shell |
| Tabs (light variant) | `dSbmt` | lBar |
| Tabs (dark variant) | `JMEj2` | dBar |
| Data display patterns | `0UVv8` | 6 · Data Display & Patterns |
| Cascade columns | `tTGKy` | Cascade columns |
| Rule list pattern | `gwe9i` | Rule list pattern |
| Save controls (4 states) | `xF1Gy` | Save controls |
| Diff viewer | `yurnB` | Diff viewer |
| Empty states | `JOJ4Q` | Empty states |

## 5. Working with Pencil

When a change affects visual design:

1. Update the Pencil frame first via the `pencil` MCP tools (never
   edit .pen files directly — they're encrypted).
2. Use `mcp__pencil__batch_get` with the frame ID to read exact
   values (fills, radii, paddings) and port them to the code.
3. Use `mcp__pencil__get_screenshot` to verify visual parity before
   committing.

Keep `tailwind.config.ts` values as the code's source of truth —
`:root` CSS vars mirror them for use outside Tailwind utilities.
