import { ChevronDown } from "lucide-react";
import { useState } from "react";
import { cn } from "../lib/cn";
import type { MergedView } from "../types";
import { Card, HelpNote, SectionLabel } from "./ui";

/** Top-level settings keys that have a dedicated editor tab in the app. */
const HANDLED_KEYS: readonly string[] = [
  "permissions",
  "env",
  "hooks",
  "model",
  "outputStyle",
  "effortLevel",
  "alwaysThinkingEnabled",
  "includeCoAuthoredBy",
  "enabledPlugins",
  "enabledMcpjsonServers",
  "disabledMcpjsonServers",
  "mcpServers",
];

/** Keys that are known to Claude Code but intentionally not edited here
 *  (Claude Code writes them itself, or they have no typed editor yet). */
const MANAGED_KEYS: readonly string[] = [
  "$schema",
  "feedbackSurveyState",
  "statusLine",
  "apiKeyHelper",
];

const HANDLED = new Set(HANDLED_KEYS);
const MANAGED = new Set(MANAGED_KEYS);

type Bucket = { key: string; value: unknown };

function categorize(value: unknown): {
  unknown: Bucket[];
  managed: Bucket[];
} {
  const out: { unknown: Bucket[]; managed: Bucket[] } = {
    unknown: [],
    managed: [],
  };
  if (typeof value !== "object" || value === null) return out;
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (HANDLED.has(k)) continue;
    if (MANAGED.has(k)) out.managed.push({ key: k, value: v });
    else out.unknown.push({ key: k, value: v });
  }
  out.unknown.sort((a, b) => a.key.localeCompare(b.key));
  out.managed.sort((a, b) => a.key.localeCompare(b.key));
  return out;
}

export function UnknownKeysPanel({ merged }: { merged: MergedView }) {
  const { unknown, managed } = categorize(merged.value);
  if (unknown.length === 0 && managed.length === 0) return null;
  return (
    <section className="space-y-5">
      {unknown.length > 0 && (
        <KeyGroup
          title="Unknown keys"
          description="Top-level keys present in your cascade that don't map to any editor in this version. They round-trip untouched when you save other categories, but you'll need to edit the source files directly."
          buckets={unknown}
          tone="unknown"
        />
      )}
      {managed.length > 0 && (
        <KeyGroup
          title="Auto-managed"
          description="Keys Claude Code writes on its own or that don't have a typed editor here yet."
          buckets={managed}
          tone="managed"
        />
      )}
    </section>
  );
}

function KeyGroup({
  title,
  description,
  buckets,
  tone,
}: {
  title: string;
  description: string;
  buckets: Bucket[];
  tone: "unknown" | "managed";
}) {
  return (
    <Card
      variant="soft"
      className={cn(
        "p-5 space-y-3",
        tone === "unknown" && "border-l-[3px] border-amber-500",
      )}
    >
      <div className="flex items-baseline justify-between">
        <SectionLabel>{title}</SectionLabel>
        <span className="font-body text-xs text-muted">{buckets.length}</span>
      </div>
      <HelpNote>{description}</HelpNote>
      <ul className="space-y-1.5">
        {buckets.map((b) => (
          <KeyRow key={b.key} bucket={b} />
        ))}
      </ul>
    </Card>
  );
}

function KeyRow({ bucket }: { bucket: Bucket }) {
  const [open, setOpen] = useState(false);
  return (
    <li className="rounded-soft-sm bg-canvas overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className={cn(
          "w-full flex items-center justify-between gap-3 px-4 py-2.5 text-left",
          "transition-colors hover:bg-canvas/80",
          "focus:outline-none focus-visible:shadow-focus-ink",
        )}
      >
        <span className="font-mono text-sm text-ink truncate">{bucket.key}</span>
        <span className="inline-flex items-center gap-1.5 font-body text-xs text-muted flex-shrink-0">
          <span>{describe(bucket.value)}</span>
          <ChevronDown
            className={cn(
              "w-3.5 h-3.5 transition-transform",
              open && "rotate-180",
            )}
          />
        </span>
      </button>
      {open && (
        <pre className="px-4 pb-3 font-mono text-xs text-body overflow-auto max-h-48 whitespace-pre-wrap">
          {JSON.stringify(bucket.value, null, 2)}
        </pre>
      )}
    </li>
  );
}

function describe(value: unknown): string {
  if (value === null) return "null";
  if (Array.isArray(value)) return `array(${value.length})`;
  if (typeof value === "object") {
    return `object(${Object.keys(value as Record<string, unknown>).length})`;
  }
  return typeof value;
}
