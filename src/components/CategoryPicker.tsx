import { cn } from "../lib/cn";
import { useUi, type Category } from "../state/ui";

const TABS: { id: Category; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "permissions", label: "Permissions" },
  { id: "env", label: "Env" },
  { id: "model", label: "Model" },
  { id: "memory", label: "Memory" },
  { id: "plugins", label: "Plugins" },
  { id: "hooks", label: "Hooks" },
  { id: "mcp", label: "MCP" },
];

export function CategoryPicker() {
  const { category, setCategory } = useUi();
  return (
    <div
      role="tablist"
      aria-label="Settings categories"
      className="flex flex-wrap gap-1 border-b border-default mb-6"
    >
      {TABS.map((t) => (
        <button
          key={t.id}
          type="button"
          role="tab"
          aria-selected={category === t.id}
          onClick={() => setCategory(t.id)}
          className={cn(
            "px-3 py-2 text-sm -mb-px border-b-2 transition-colors",
            category === t.id
              ? "border-current"
              : "border-transparent text-muted hover:text-current",
          )}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}
