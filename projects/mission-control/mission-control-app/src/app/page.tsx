import Link from "next/link";
import { MissionShell } from "@/components/mission-shell";
import { Card, Stat } from "@/components/ui";
import { readStore } from "@/lib/storage";

const modules = [
  {
    title: "Listing Manager",
    href: "/projects",
    description: "The source of truth for private PIER listing intake, facts, files, and next actions.",
    status: "Build now",
    statusTone: "orange",
    step: "01",
  },
  {
    title: "Offering Summaries",
    href: "/offering-summaries",
    description: "Broker-facing summary drafts generated from clean listing records and uploaded source files.",
    status: "Ready to test",
    statusTone: "green",
    step: "02",
  },
  {
    title: "Listing Agreements",
    href: "/listing-agreements",
    description: "Draft-only listing agreement packets with source terms, missing fields, and review notes.",
    status: "Phase 3 live",
    statusTone: "green",
    step: "03",
  },
  {
    title: "Sales Contracts",
    href: "/sales-contracts",
    description: "Deal-point drafting sheets for buyer, seller, price, diligence, close, and milestone blanks.",
    status: "Phase 3 live",
    statusTone: "green",
    step: "04",
  },
  {
    title: "Offering Websites",
    href: "/offering-websites",
    description: "Public-safe single-property website plans with hero copy, sections, CTAs, and exclusions.",
    status: "Phase 3 live",
    statusTone: "green",
    step: "05",
  },
  {
    title: "Daily Task Control",
    href: "/daily-control",
    description: "Kanban-style execution board tying listings, deliverables, follow-ups, and Hermes prompts together.",
    status: "Scaffolded",
    statusTone: "neutral",
    step: "06",
  },
];

export default async function Home() {
  const store = await readStore();
  const listings = store.projects.filter((project) => project.type === "listing");
  const activeListings = listings.filter((project) => project.listingStatus === "Active").length;
  const pipelineListings = listings.filter((project) => !project.listingStatus || project.listingStatus === "Pipeline").length;
  const latestListing = listings[0];

  return (
    <MissionShell
      title="Executive Dashboard"
      subtitle="PIER’s private command center for turning listing intake into summaries, agreements, contracts, websites, daily tasks, and Hermes-assisted execution."
      currentPath="/"
      actions={[
        { href: "/projects", label: "Enter a listing", tone: "primary" },
        { href: "/uploads", label: "Attach files" },
        { href: "/daily-control", label: "Task board", tone: "ghost" },
      ]}
    >
      <section className="relative overflow-hidden rounded-[2rem] border border-zinc-200 bg-zinc-950 p-6 text-white shadow-sm lg:p-8">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(203,82,30,0.34),transparent_34%),linear-gradient(135deg,rgba(255,255,255,0.08),transparent_42%)]" />
        <div className="relative grid gap-8 xl:grid-cols-[1.2fr_0.8fr] xl:items-end">
          <div>
            <div className="inline-flex rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] uppercase tracking-[0.24em] text-[#f6b28d]">
              Start here
            </div>
            <h3 className="mt-5 max-w-3xl text-3xl font-semibold tracking-tight text-white md:text-5xl">
              Run the listing workflow from one clean source record.
            </h3>
            <p className="mt-4 max-w-2xl text-sm leading-6 text-zinc-300 md:text-base md:leading-7">
              Enter the listing once, attach the supporting files, then use Mission Control to generate the internal packets that drive marketing, documents, public pages, and daily follow-up.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <HeroButton href="/projects" label="Add or review listings" primary />
              <HeroButton href="/offering-websites" label="Preview public website plans" />
            </div>
          </div>

          <div className="rounded-3xl border border-white/10 bg-white/[0.06] p-4 backdrop-blur">
            <p className="text-[11px] uppercase tracking-[0.24em] text-zinc-400">Current operating read</p>
            <div className="mt-4 grid grid-cols-2 gap-3">
              <MiniStat label="Listings" value={String(listings.length)} />
              <MiniStat label="Active" value={String(activeListings)} />
              <MiniStat label="Pipeline" value={String(pipelineListings)} />
              <MiniStat label="Uploads" value={String(store.uploads.length)} />
            </div>
            <div className="mt-4 rounded-2xl border border-white/10 bg-black/20 p-4">
              <p className="text-xs text-zinc-400">Latest source record</p>
              <p className="mt-1 font-medium text-white">{latestListing?.name ?? "No listing entered yet"}</p>
              <p className="mt-2 text-xs leading-5 text-zinc-400">
                {latestListing ? "Open Listing Manager to confirm facts, files, and next actions before generating downstream deliverables." : "Create a listing record first, then the Phase 3 modules will have live source data to work from."}
              </p>
            </div>
          </div>
        </div>
      </section>

      <div className="mt-6 grid gap-4 md:grid-cols-2 2xl:grid-cols-5">
        <Stat label="Listing records" value={String(listings.length)} />
        <Stat label="Active listings" value={String(activeListings)} />
        <Stat label="Pipeline" value={String(pipelineListings)} />
        <Stat label="Uploads" value={String(store.uploads.length)} />
        <Stat label="Private mode" value="On" />
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-[0.8fr_1.2fr]">
        <Card title="Recommended flow" description="Use this order when testing the app so each downstream page has useful source data.">
          <div className="space-y-3">
            <WorkflowStep href="/projects" eyebrow="Step 1" title="Enter or clean up the listing" detail="Confirm property facts, listing status, ownership notes, pricing, size, and internal next actions." />
            <WorkflowStep href="/uploads" eyebrow="Step 2" title="Attach source files" detail="Add photos, PDFs, flyers, notes, or source documents that support the listing record." />
            <WorkflowStep href="/offering-summaries" eyebrow="Step 3" title="Generate broker-facing copy" detail="Use the clean facts to draft offering summaries before documents or public pages." />
            <WorkflowStep href="/daily-control" eyebrow="Step 4" title="Move the work forward" detail="Turn missing fields and follow-ups into daily tasks instead of leaving them buried in notes." />
          </div>
        </Card>

        <Card title="Six-module build map" description="Green modules are ready for review. Gray modules are shells that still need deeper workflow wiring.">
          <div className="grid gap-3 lg:grid-cols-2">
            {modules.map((module) => (
              <Link key={module.href} href={module.href} className="group rounded-2xl border border-zinc-200 bg-zinc-50 p-4 transition hover:-translate-y-0.5 hover:border-[#CB521E]/35 hover:bg-white hover:shadow-md">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <span className="grid h-9 w-9 place-items-center rounded-2xl border border-zinc-200 bg-white text-xs font-semibold text-zinc-500 shadow-sm">
                      {module.step}
                    </span>
                    <h3 className="font-semibold text-zinc-950">{module.title}</h3>
                  </div>
                  <StatusBadge tone={module.statusTone}>{module.status}</StatusBadge>
                </div>
                <p className="mt-3 text-sm leading-6 text-zinc-600">{module.description}</p>
                <p className="mt-4 text-sm font-medium text-[#CB521E] opacity-80 transition group-hover:opacity-100">
                  Open module →
                </p>
              </Link>
            ))}
          </div>
        </Card>
      </div>
    </MissionShell>
  );
}

function HeroButton({ href, label, primary = false }: { href: string; label: string; primary?: boolean }) {
  return (
    <Link
      href={href}
      className={
        primary
          ? "rounded-xl bg-[#CB521E] px-4 py-3 text-sm font-medium text-white shadow-lg shadow-[#CB521E]/20 transition hover:bg-[#a94318]"
          : "rounded-xl border border-white/15 bg-white/5 px-4 py-3 text-sm font-medium text-zinc-100 transition hover:bg-white/10"
      }
    >
      {label}
    </Link>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-3">
      <p className="text-[10px] uppercase tracking-[0.2em] text-zinc-500">{label}</p>
      <p className="mt-1 text-2xl font-semibold text-white">{value}</p>
    </div>
  );
}

function WorkflowStep({ href, eyebrow, title, detail }: { href: string; eyebrow: string; title: string; detail: string }) {
  return (
    <Link href={href} className="block rounded-2xl border border-zinc-200 bg-zinc-50 p-4 transition hover:border-[#CB521E]/30 hover:bg-[#CB521E]/5">
      <p className="text-[11px] uppercase tracking-[0.22em] text-[#CB521E]">{eyebrow}</p>
      <h3 className="mt-1 font-semibold text-zinc-950">{title}</h3>
      <p className="mt-2 text-sm leading-6 text-zinc-600">{detail}</p>
    </Link>
  );
}

function StatusBadge({ tone, children }: { tone: string; children: string }) {
  const classes = {
    orange: "border-[#CB521E]/20 bg-[#CB521E]/10 text-[#CB521E]",
    green: "border-emerald-500/20 bg-emerald-50 text-emerald-700",
    neutral: "border-zinc-200 bg-zinc-100 text-zinc-600",
  }[tone] ?? "border-zinc-200 bg-zinc-100 text-zinc-600";

  return <span className={`shrink-0 rounded-full border px-2.5 py-1 text-[10px] uppercase tracking-[0.16em] ${classes}`}>{children}</span>;
}
