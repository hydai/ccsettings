import type { Category } from "../state/ui";

export const CATEGORY_META: Record<
  Category,
  { label: string; description: string }
> = {
  overview: {
    label: "Overview",
    description:
      "The effective merged settings for this project, plus which tier each top-level key came from. Read-only summary.",
  },
  permissions: {
    label: "Permissions",
    description:
      "What Claude Code is allowed to do without asking — tool calls, shell commands, MCP servers. Entries use the pattern Tool(args), e.g. Bash(git *), WebFetch(*), mcp__pencil.",
  },
  env: {
    label: "Environment variables",
    description:
      "Environment variables Claude Code injects into its shell tools. Keys that look like secrets (TOKEN, KEY, SECRET, PASSWORD, API) are masked by default.",
  },
  model: {
    label: "Model and flags",
    description:
      "Which Claude model runs this project, the output style, how hard it thinks, and a couple of default-commit behaviors. Leave a field on “inherit” to let lower tiers supply the value.",
  },
  memory: {
    label: "Memory files",
    description:
      "Markdown files Claude Code always has in its context for this scope (CLAUDE.md, AGENTS.md, GEMINI.md). Think of them as durable instructions that don't fit in a single prompt.",
  },
  plugins: {
    label: "Plugins",
    description:
      "Extensions installed into ~/.claude/plugins/ that add commands, skills, agents, or hooks. Toggle them on or off per tier without uninstalling.",
  },
  hooks: {
    label: "Hooks",
    description:
      "Shell commands Claude Code runs automatically at specific events (PreToolUse, PostToolUse, Stop, …). Useful for enforcing repo policies, formatting, or logging. Commands at the same event+matcher run together.",
  },
  mcp: {
    label: "MCP servers",
    description:
      "External processes Claude Code can call via Model Context Protocol — extra tools beyond the built-ins. User-scope servers live in ~/.claude.json, project-scope in .mcp.json. Toggle activation per tier here.",
  },
};
