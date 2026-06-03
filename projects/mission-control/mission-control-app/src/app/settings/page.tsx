import { MissionShell } from "@/components/mission-shell";
import { Card } from "@/components/ui";

const settingsCards = [
  {
    title: "User model",
    description: "Single primary user for MVP, with room for future staff access.",
    note: "Keep auth simple until workflow value is proven.",
  },
  {
    title: "Deploy target",
    description: "VPN-hosted private deployment, likely with Docker and reverse proxy later.",
    note: "Healthcheck + standalone runtime are now in place.",
  },
  {
    title: "Custom tools",
    description: "Support both UI-driven tools and code-defined tools in later iterations.",
    note: "Best next step is deciding which tools deserve real forms vs prompt wrappers.",
  },
  {
    title: "Data model",
    description: "Projects, workflows, tool runs, notes, and activity logs are expected in v1.x.",
    note: "Project-linked history is now real enough to build on.",
  },
];

export default function SettingsPage() {
  return (
    <MissionShell
      title="Settings"
      subtitle="Configuration for auth, environments, custom tools, integrations, and deployment should be centralized here."
      currentPath="/settings"
      actions={[
        { href: "/activity", label: "Open activity", tone: "primary" },
        { href: "/usage", label: "View usage" },
      ]}
    >
      <div className="grid gap-4 lg:grid-cols-2">
        {settingsCards.map((card) => (
          <Card key={card.title} title={card.title} description={card.description}>
            <div className="rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-neutral-300">
              {card.note}
            </div>
          </Card>
        ))}
      </div>
    </MissionShell>
  );
}
