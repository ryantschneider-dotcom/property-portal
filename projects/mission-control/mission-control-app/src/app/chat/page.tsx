import { MissionShell } from "@/components/mission-shell";
import { ChatConsole } from "@/components/chat-console";

export default async function ChatPage({
  searchParams,
}: {
  searchParams: Promise<{ project?: string }>;
}) {
  const { project } = await searchParams;
  return (
    <MissionShell
      title="AI Chat"
      subtitle="The chat module now launches context-aware local prompt actions so Mission Control is starting to function as an internal command center, not just a static app shell."
      currentPath="/chat"
      actions={[
        { href: "/projects", label: "Open projects", tone: "primary" },
        { href: "/tools", label: "Run tool" },
        { href: "/uploads", label: "Upload file", tone: "ghost" },
      ]}
    >
      <ChatConsole initialProjectId={project} />
    </MissionShell>
  );
}
