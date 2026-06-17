import { MissionShell } from "@/components/mission-shell";
import { toolRegistry } from "@/lib/mission-data";
import { ToolRunner } from "@/components/tool-runner";

export default async function ToolsPage({
  searchParams,
}: {
  searchParams: Promise<{ project?: string }>;
}) {
  const readyTools = toolRegistry.filter((tool) => tool.status === "ready");
  const { project } = await searchParams;

  return (
    <MissionShell
      title="Tools"
      subtitle="This is now the first real interactive module in Mission Control: select a tool, provide input, run it, and keep the output in local app history."
      currentPath="/tools"
      actions={[
        { href: "/projects", label: "Open projects", tone: "primary" },
        { href: "/uploads", label: "Upload file", tone: "ghost" },
      ]}
    >
      <ToolRunner tools={readyTools} initialProjectId={project} />
    </MissionShell>
  );
}
