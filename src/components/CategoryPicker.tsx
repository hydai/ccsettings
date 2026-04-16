import { cn } from "../lib/cn";
import { useUi, type Category } from "../state/ui";

type Tab = {
  id: Category;
  label: string;
  /** Categories landing in later phases are dimmed but still clickable. */
  phase?: number;
};

const TABS: Tab[] = [
  { id: "overview", label: "Overview" },
  { id: "permissions", label: "Permissions" },
  { id: "env", label: "Env" },
  { id: "model", label: "Model" },
  { id: "memory", label: "Memory" },
  { id: "plugins", label: "Plugins" },
  { id: "hooks", label: "Hooks" },
  { id: "mcp", label: "MCP", phase: 4 },
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
          {t.phase && (
            <span
              className="ml-1.5 text-[10px] text-muted align-middle"
              title={`Lands in phase ${t.phase}`}
            >
              v{t.phase}
            </span>
          )}
        </button>
      ))}
    </div>
  );
}
