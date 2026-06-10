import { MissionShell } from "@/components/mission-shell";
import { UsagePanel } from "@/components/usage-panel";

export default function UsagePage() {
  return (
    <MissionShell
      title="Usage"
      subtitle="Track local token estimates and approximate cost so Ryan can keep an eye on model usage while Mission Control becomes more autonomous."
      currentPath="/usage"
      actions={[
        { href: "/activity", label: "Open activity", tone: "primary" },
        { href: "/projects", label: "Open projects" },
      ]}
    >
      <UsagePanel />
    </MissionShell>
  );
}
