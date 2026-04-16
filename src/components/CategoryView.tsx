import type { Category } from "../state/ui";
import type { MergedView, Workspace } from "../types";
import { CascadeHeader } from "./CascadeHeader";
import { EnvEditor } from "./EnvEditor";
import { HooksEditor } from "./HooksEditor";
import { McpEditor } from "./McpEditor";
import { MemoryEditor } from "./MemoryEditor";
import { ModelEditor } from "./ModelEditor";
import { PermissionsEditor } from "./PermissionsEditor";
import { PluginsEditor } from "./PluginsEditor";

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
    case "model":
      return <ModelEditor workspace={workspace} />;
    case "memory":
      return <MemoryEditor workspace={workspace} />;
    case "plugins":
      return <PluginsEditor workspace={workspace} />;
    case "hooks":
      return <HooksEditor workspace={workspace} />;
    case "mcp":
      return <McpEditor workspace={workspace} />;
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
