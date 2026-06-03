import { MissionShell } from "@/components/mission-shell";
import { Card } from "@/components/ui";
import { ActivityStream } from "@/components/activity-stream";

export default function ActivityPage() {
  return (
    <MissionShell
      title="Activity"
      subtitle="Activity now includes shared system/project events plus locally stored tool runs so the app can begin functioning outside chat."
      currentPath="/activity"
      actions={[
        { href: "/projects", label: "Open projects", tone: "primary" },
        { href: "/usage", label: "View usage" },
      ]}
    >
      <Card
        title="Activity stream"
        description="This is the first real audit trail layer for Mission Control."
      >
        <ActivityStream full />
      </Card>
    </MissionShell>
  );
}
