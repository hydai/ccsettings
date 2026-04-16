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
      className="inline-flex flex-wrap gap-1 p-1 bg-card shadow-soft rounded-full"
    >
      {TABS.map((t) => {
        const active = category === t.id;
        return (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => setCategory(t.id)}
            className={cn(
              "px-4 py-1.5 rounded-full font-sans text-sm font-medium transition-colors",
              "focus:outline-none focus-visible:shadow-focus-ink",
              active
                ? "bg-inverse text-on-inverse shadow-soft"
                : "text-muted hover:text-ink",
            )}
          >
            {t.label}
          </button>
        );
      })}
    </div>
  );
}
