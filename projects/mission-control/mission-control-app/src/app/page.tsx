import Link from "next/link";

import { MasterCopilotConsole } from "@/components/master-copilot-console";
import { MissionShell } from "@/components/mission-shell";
import { readStore } from "@/lib/storage";

const domainCards = [
  {
    title: "PIER Commercial",
    href: "/pier-workspace",
    eyebrow: "Corporate workspace",
    description: "Brokerage operations, ListingStream deliverables, PIER Pulse, and company marketing live in a dedicated sandbox away from the global Hermes chat stream.",
    status: "Active domain",
    metric: "Brokerage + Marketing",
    accent: "#CB521E",
  },
  {
    title: "Personal Operations",
    href: "/master-console",
    eyebrow: "General command lane",
    description: "Life logistics, research, travel-style planning, documents, media, and broad Ryan support stay routed through the general Hermes module.",
    status: "Hermes routed",
    metric: "General AI",
    accent: "#18181b",
  },
  {
    title: "Software + Infrastructure",
    href: "/activity",
    eyebrow: "Systems lane",
    description: "Repo work, Vercel deploys, Mac mini health, OpenClaw/Mack status, and long-running build activity stay visible as system operations.",
    status: "Command center",
    metric: "DevOps",
    accent: "#2563eb",
  },
];

const commandStats = [
  { label: "Domains online", value: "3" },
  { label: "PIER zones", value: "2" },
  { label: "Hermes mode", value: "Global" },
  { label: "Desktop layout", value: "Wide" },
];

export default async function Home() {
  const store = await readStore();
  const listings = store.projects.filter((project) => project.type === "listing");
  const activeListings = listings.filter((project) => project.listingStatus === "Active").length;
  const pipelineListings = listings.filter((project) => !project.listingStatus || project.listingStatus === "Pipeline").length;

  return (
    <MissionShell
      title="Mission Control OS"
      subtitle="A 30,000-foot multi-domain operating dashboard that keeps the global Hermes Master Chat visually separate from structured PIER Commercial workflows."
      currentPath="/"
      actions={[
        { href: "/master-console", label: "Open Hermes Chat", tone: "ghost" },
        { href: "/pier-workspace", label: "Enter PIER Workspace", tone: "primary" },
      ]}
    >
      <div className="grid min-h-[calc(100dvh-12rem)] gap-6 2xl:grid-cols-[minmax(0,1fr)_540px]">
        <section className="min-w-0 space-y-6">
          <div className="relative overflow-hidden rounded-[2.25rem] border border-zinc-200 bg-zinc-950 p-7 text-white shadow-sm xl:p-9">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_12%_20%,rgba(203,82,30,0.38),transparent_30%),radial-gradient(circle_at_88%_8%,rgba(255,255,255,0.18),transparent_24%),linear-gradient(135deg,rgba(255,255,255,0.08),transparent_45%)]" />
            <div className="relative grid gap-8 xl:grid-cols-[1.25fr_0.75fr] xl:items-end">
              <div>
                <p className="inline-flex rounded-full border border-white/10 bg-white/10 px-3 py-1 text-[11px] uppercase tracking-[0.28em] text-[#f6b28d]">
                  Global dashboard UI
                </p>
                <h3 className="mt-5 max-w-4xl text-4xl font-semibold tracking-tight text-white xl:text-6xl">
                  Separate the chat stream from the operating system.
                </h3>
                <p className="mt-5 max-w-3xl text-base leading-8 text-zinc-300">
                  Hermes remains available as a persistent master chat module, while PIER Commercial and future company domains live as structured command cards with their own routed workspaces.
                </p>
                <div className="mt-7 flex flex-wrap gap-3">
                  <Link href="/pier-workspace" className="rounded-2xl bg-[#CB521E] px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-[#CB521E]/20 transition hover:bg-[#a94318]">
                    Enter PIER Commercial
                  </Link>
                  <Link href="/master-console" className="rounded-2xl border border-white/15 bg-white/10 px-5 py-3 text-sm font-semibold text-white transition hover:bg-white/15">
                    Full-screen Hermes Chat
                  </Link>
                </div>
              </div>
              <div className="rounded-[2rem] border border-white/10 bg-white/[0.06] p-5 backdrop-blur">
                <p className="text-[11px] uppercase tracking-[0.24em] text-zinc-400">PIER operating read</p>
                <div className="mt-4 grid grid-cols-2 gap-3">
                  <MiniReadout label="Listings" value={String(listings.length)} />
                  <MiniReadout label="Active" value={String(activeListings)} />
                  <MiniReadout label="Pipeline" value={String(pipelineListings)} />
                  <MiniReadout label="Uploads" value={String(store.uploads.length)} />
                </div>
              </div>
            </div>
          </div>

          <div className="grid gap-4 xl:grid-cols-4">
            {commandStats.map((stat) => (
              <div key={stat.label} className="rounded-[1.5rem] border border-zinc-200 bg-white p-5 shadow-sm">
                <p className="text-[10px] uppercase tracking-[0.22em] text-zinc-500">{stat.label}</p>
                <p className="mt-3 text-2xl font-semibold tracking-tight text-zinc-950">{stat.value}</p>
              </div>
            ))}
          </div>

          <section className="rounded-[2rem] border border-zinc-200 bg-white p-5 shadow-sm xl:p-6">
            <div className="flex flex-col gap-3 xl:flex-row xl:items-end xl:justify-between">
              <div>
                <p className="text-[11px] uppercase tracking-[0.26em] text-[#CB521E]">Domain cards</p>
                <h3 className="mt-2 text-2xl font-semibold tracking-tight text-zinc-950">30,000-foot operating map</h3>
                <p className="mt-2 max-w-3xl text-sm leading-6 text-zinc-600">
                  Each domain is a visual sandbox. Click into PIER Commercial for brokerage and company marketing workflows; keep unrelated AI work in the global Hermes lane.
                </p>
              </div>
              <span className="w-fit rounded-full border border-zinc-200 bg-zinc-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-zinc-500">Desktop command grid</span>
            </div>
            <div className="mt-6 grid gap-4 xl:grid-cols-3">
              {domainCards.map((domain) => (
                <Link key={domain.title} href={domain.href} className="group flex min-h-72 flex-col rounded-[2rem] border border-zinc-200 bg-zinc-50 p-5 transition hover:-translate-y-1 hover:border-[#CB521E]/35 hover:bg-white hover:shadow-xl">
                  <div className="flex items-center justify-between gap-4">
                    <span className="rounded-full border border-zinc-200 bg-white px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-zinc-500">{domain.eyebrow}</span>
                    <span className="h-3 w-3 rounded-full" style={{ backgroundColor: domain.accent }} />
                  </div>
                  <div className="mt-8">
                    <p className="text-sm font-semibold text-zinc-500">{domain.metric}</p>
                    <h4 className="mt-2 text-3xl font-semibold tracking-tight text-zinc-950">{domain.title}</h4>
                    <p className="mt-4 text-sm leading-7 text-zinc-600">{domain.description}</p>
                  </div>
                  <div className="mt-auto flex items-center justify-between pt-8">
                    <span className="rounded-full border border-emerald-500/20 bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">{domain.status}</span>
                    <span className="text-sm font-semibold text-[#CB521E] transition group-hover:translate-x-1">Open →</span>
                  </div>
                </Link>
              ))}
            </div>
          </section>
        </section>

        <aside className="min-h-0 rounded-[2.25rem] border border-zinc-300/70 bg-[#eee9e1] p-3 shadow-sm 2xl:sticky 2xl:top-[9rem] 2xl:h-[calc(100dvh-10.5rem)]">
          <div className="mb-3 flex items-center justify-between px-3 pt-2">
            <div>
              <p className="text-[10px] uppercase tracking-[0.26em] text-zinc-500">Sandboxed module</p>
              <h3 className="mt-1 text-lg font-semibold text-zinc-950">Global Hermes Master Chat</h3>
            </div>
            <span className="rounded-full bg-zinc-950 px-3 py-1 text-xs font-semibold text-white">Persistent</span>
          </div>
          <MasterCopilotConsole mode="dashboard" />
        </aside>
      </div>
    </MissionShell>
  );
}

function MiniReadout({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.05] p-3">
      <p className="text-[10px] uppercase tracking-[0.2em] text-zinc-500">{label}</p>
      <p className="mt-1 text-2xl font-semibold text-white">{value}</p>
    </div>
  );
}
