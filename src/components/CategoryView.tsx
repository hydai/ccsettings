import type { Category } from "../state/ui";
import type { MergedView, Workspace } from "../types";
import { CascadeHeader } from "./CascadeHeader";
import { EnvEditor } from "./EnvEditor";
import { PermissionsEditor } from "./PermissionsEditor";

type Props = {
  category: Category;
  workspace: Workspace;
  merged: MergedView;
};

export function CategoryView({ category, workspace, merged }: Props) {
  switch (category) {
    case "overview":
      return <Overview merged={merged} />;
    case "permissions":
      return <PermissionsEditor workspace={workspace} />;
    case "env":
      return <EnvEditor workspace={workspace} />;
    default:
      return (
        <ComingSoon
          category={category}
          merged={merged}
          workspaceId={workspace.id}
        />
      );
  }
}

function Overview({ merged }: { merged: MergedView }) {
  return (
    <>
      <CascadeHeader merged={merged} />
      <section>
        <h3 className="text-xs font-medium uppercase tracking-wider text-muted mb-2">
          Effective merged settings
        </h3>
        <pre className="border border-default rounded-lg p-4 surface text-xs font-mono overflow-auto max-h-[50vh]">
          {JSON.stringify(merged.value, null, 2)}
        </pre>
      </section>
    </>
  );
}

function ComingSoon({
  category,
  merged,
}: {
  category: Category;
  merged: MergedView;
  workspaceId: string;
}) {
  const subtree = extractSubtree(merged.value, categoryPath(category));
  return (
    <>
      <div className="border border-default rounded p-4 surface mb-6">
        <p className="text-sm">
          The <span className="font-semibold">{category}</span> editor is
          implemented progressively. For now you can see the effective merged
          subtree for this category below.
        </p>
      </div>
      <section>
        <h3 className="text-xs font-medium uppercase tracking-wider text-muted mb-2">
          Effective {category}
        </h3>
        <pre className="border border-default rounded-lg p-4 surface text-xs font-mono overflow-auto max-h-[50vh]">
          {subtree === undefined
            ? "(no value at this category)"
            : JSON.stringify(subtree, null, 2)}
        </pre>
      </section>
    </>
  );
}

/** Top-level settings key the category maps to (some categories span multiple). */
function categoryPath(category: Category): string | null {
  switch (category) {
    case "permissions":
      return "permissions";
    case "env":
      return "env";
    case "hooks":
      return "hooks";
    case "plugins":
      return "enabledPlugins";
    case "mcp":
      return "mcpServers";
    case "model":
    case "memory":
    case "overview":
    default:
      return null;
  }
}

function extractSubtree(value: unknown, key: string | null): unknown {
  if (key === null) return value;
  if (typeof value !== "object" || value === null) return undefined;
  return (value as Record<string, unknown>)[key];
}
