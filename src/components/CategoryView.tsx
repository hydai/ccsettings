import type { Category } from "../state/ui";
import type { MergedView, Workspace } from "../types";
import { CascadeHeader } from "./CascadeHeader";
import { CategoryHeader } from "./CategoryHeader";
import { EnvEditor } from "./EnvEditor";
import { HooksEditor } from "./HooksEditor";
import { McpEditor } from "./McpEditor";
import { MemoryEditor } from "./MemoryEditor";
import { ModelEditor } from "./ModelEditor";
import { PermissionsEditor } from "./PermissionsEditor";
import { PluginsEditor } from "./PluginsEditor";
import { Card, SectionLabel } from "./ui";
import { UnknownKeysPanel } from "./UnknownKeysPanel";

type Props = {
  category: Category;
  workspace: Workspace;
  merged: MergedView;
};

export function CategoryView({ category, workspace, merged }: Props) {
  return (
    <>
      <CategoryHeader category={category} />
      {renderBody(category, workspace, merged)}
    </>
  );
}

function renderBody(
  category: Category,
  workspace: Workspace,
  merged: MergedView,
) {
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
    <div className="space-y-6">
      <CascadeHeader merged={merged} />
      <section className="space-y-2">
        <SectionLabel>Effective merged settings</SectionLabel>
        <Card variant="cream" className="p-5 overflow-hidden">
          <pre className="font-mono text-xs leading-[1.55] text-body overflow-auto max-h-[50vh]">
            {JSON.stringify(merged.value, null, 2)}
          </pre>
        </Card>
      </section>
      <UnknownKeysPanel merged={merged} />
    </div>
  );
}
