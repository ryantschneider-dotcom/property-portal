import { HermesCopilotMasterConsole } from "@/components/hermes-copilot-drawer";
import { MissionShell } from "@/components/mission-shell";

export default function HermesCopilotPage() {
  return (
    <MissionShell
      title="Hermes Co-Pilot"
      subtitle="Native Mission Control chat for direct Hermes execution, OpenClaw-backed command routing, and mobile command center workflows."
      currentPath="/hermes-co-pilot"
      actions={[{ href: "/pier-manager", label: "PIER Manager", tone: "secondary" }]}
    >
      <HermesCopilotMasterConsole />
    </MissionShell>
  );
}
