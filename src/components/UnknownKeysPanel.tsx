import { useState } from "react";
import { cn } from "../lib/cn";
import type { MergedView } from "../types";

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
    <section className="mt-8 space-y-4">
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
    <div>
      <div className="flex items-baseline justify-between mb-1">
        <h3 className="text-xs font-medium uppercase tracking-wider text-muted">
          {title}
        </h3>
        <span className="text-xs text-muted">{buckets.length}</span>
      </div>
      <p className="text-xs text-muted mb-2">{description}</p>
      <ul className="space-y-1">
        {buckets.map((b) => (
          <KeyRow key={b.key} bucket={b} tone={tone} />
        ))}
      </ul>
    </div>
  );
}

function KeyRow({
  bucket,
  tone,
}: {
  bucket: Bucket;
  tone: "unknown" | "managed";
}) {
  const [open, setOpen] = useState(false);
  return (
    <li
      className={cn(
        "border rounded surface",
        tone === "unknown"
          ? "border-amber-500/30"
          : "border-default",
      )}
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="w-full flex items-center justify-between px-3 py-2 text-left hover:bg-black/5 dark:hover:bg-white/5"
      >
        <span className="font-mono text-sm">{bucket.key}</span>
        <span className="text-xs text-muted">
          {describe(bucket.value)} · {open ? "hide" : "inspect"}
        </span>
      </button>
      {open && (
        <pre className="px-3 pb-3 text-xs font-mono overflow-auto max-h-48 whitespace-pre-wrap">
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
