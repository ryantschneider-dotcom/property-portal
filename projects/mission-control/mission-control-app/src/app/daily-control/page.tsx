import { MissionShell } from "@/components/mission-shell";
import { ListingTaskBoard } from "@/components/listing-task-board";
import { listProjectSummaries } from "@/lib/project-summaries";
import { readStore } from "@/lib/storage";

export default async function DailyControlPage() {
  const store = await readStore();
  const listingProjects = listProjectSummaries(store).filter((project) => project.type === "listing");

  return (
    <MissionShell
      title="Daily Task Control"
      subtitle="Persistent task board for PIER listing execution, owner follow-up, document production, offering-site work, and Hermes action items."
      currentPath="/daily-control"
      actions={[{ href: "/projects", label: "Open listings", tone: "primary" }, { href: "/offering-summaries", label: "Summaries" }]}
    >
      <ListingTaskBoard initialTasks={store.listingTasks} projects={listingProjects} />
    </MissionShell>
  );
}
