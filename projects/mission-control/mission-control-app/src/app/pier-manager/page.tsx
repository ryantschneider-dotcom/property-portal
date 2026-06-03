import { MissionShell } from "@/components/mission-shell";
import { PierManagerListingConsole } from "@/components/pier-manager-listing-console";

export default function PierManagerPage() {
  return (
    <MissionShell
      title="PIER Manager"
      subtitle="Broker-facing listing uptake and AI-driven listing modification wired directly to the property-portal backend. WordPress is bypassed for listing workflows."
      currentPath="/pier-manager"
      actions={[{ href: "/projects", label: "Local listings" }, { href: "/daily-control", label: "Task board" }]}
    >
      <PierManagerListingConsole />
    </MissionShell>
  );
}
