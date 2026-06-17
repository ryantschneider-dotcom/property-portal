import { MissionShell } from "@/components/mission-shell";
import { UploadWorkspace } from "@/components/upload-workspace";

export default async function UploadsPage({
  searchParams,
}: {
  searchParams: Promise<{ project?: string }>;
}) {
  const { project } = await searchParams;
  return (
    <MissionShell
      title="Uploads"
      subtitle="Mission Control now has a real upload path so files can be stored by the app and connected to project work over time."
      currentPath="/uploads"
      actions={[
        { href: "/projects", label: "Open projects", tone: "primary" },
        { href: "/tools", label: "Run tool" },
      ]}
    >
      <UploadWorkspace initialProjectId={project} />
    </MissionShell>
  );
}
