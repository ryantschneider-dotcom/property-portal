import { MasterCopilotConsole } from "@/components/master-copilot-console";
import { MissionShell } from "@/components/mission-shell";

export default function MasterConsolePage() {
  return (
    <MissionShell
      title="Master Co-Pilot Console"
      subtitle="Ryan’s desktop-native command node for PIER operations, personal logistics, Shopify management, independent app development, and local OpenClaw execution."
      currentPath="/master-console"
      actions={[
        { href: "/activity", label: "Activity log", tone: "ghost" },
        { href: "/settings", label: "System settings" },
      ]}
    >
      <MasterCopilotConsole />
    </MissionShell>
  );
}
