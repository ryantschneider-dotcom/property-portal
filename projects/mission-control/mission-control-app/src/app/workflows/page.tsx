import Link from "next/link";
import { MissionShell } from "@/components/mission-shell";
import { Card } from "@/components/ui";

const workflows = [
  {
    name: "Daily pending items review",
    type: "ops",
    nextStep: "Turn into a launchable morning review flow",
  },
  {
    name: "Listing onboarding checklist",
    type: "brokerage",
    nextStep: "Tie into project creation and intake",
  },
  {
    name: "Property / BOV summary skeleton",
    type: "brokerage",
    nextStep: "Connect to tool outputs and saved drafts",
  },
  {
    name: "Listing activity update",
    type: "brokerage",
    nextStep: "Convert into a reusable reporting template",
  },
  {
    name: "Tenant / buyer requirement summary",
    type: "brokerage",
    nextStep: "Route into follow-up and project history",
  },
];

export default function WorkflowsPage() {
  return (
    <MissionShell
      title="Workflows"
      subtitle="A library for repeatable workflows, prompt packs, and operating templates."
      currentPath="/workflows"
      actions={[
        { href: "/tools", label: "Run tool", tone: "primary" },
        { href: "/projects", label: "Open projects" },
      ]}
    >
      <Card
        title="Workflow library"
        description="This module should become a launch surface for repeatable operating flows, not just a list of ideas."
      >
        <div className="grid gap-3 md:grid-cols-2">
          {workflows.map((workflow) => (
            <div
              key={workflow.name}
              className="rounded-xl border border-white/10 bg-black/20 p-4"
            >
              <div className="flex items-start justify-between gap-3">
                <p className="font-medium text-white">{workflow.name}</p>
                <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] uppercase tracking-[0.2em] text-neutral-300">
                  {workflow.type}
                </span>
              </div>
              <p className="mt-3 text-sm leading-6 text-neutral-400">{workflow.nextStep}</p>
            </div>
          ))}
        </div>

        <div className="mt-5 flex flex-wrap gap-3">
          <Link
            href="/tools"
            className="rounded-xl bg-cyan-500 px-4 py-2.5 text-sm font-medium text-neutral-950 transition hover:bg-cyan-400"
          >
            Run tool
          </Link>
          <Link
            href="/projects"
            className="rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm text-neutral-300 transition hover:bg-white/10"
          >
            Open projects
          </Link>
        </div>
      </Card>
    </MissionShell>
  );
}
