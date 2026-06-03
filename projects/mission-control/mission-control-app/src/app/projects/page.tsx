import { MissionShell } from "@/components/mission-shell";
import { ProjectWorkspace } from "@/components/project-workspace";

export default function ProjectsPage() {
  return (
    <MissionShell
      title="Listing Manager"
      subtitle="Private PIER listing intake and records hub. Data entered here feeds offering summaries, agreements, website scaffolds, uploads, and daily task control."
      currentPath="/projects"
      actions={[
        { href: "/uploads", label: "Upload file", tone: "primary" },
        { href: "/offering-summaries", label: "Offering summaries" },
        { href: "/daily-control", label: "Task control", tone: "ghost" },
      ]}
    >
      <ProjectWorkspace />
    </MissionShell>
  );
}
