import Link from "next/link";

import { MissionShell } from "@/components/mission-shell";

const brokerageCards = [
  {
    title: "Listing Portal Intake",
    href: "/pier-manager",
    kicker: "Intake",
    description: "Create or refresh ListingStream records from broker-entered facts, files, and public-record enrichment without leaving the PIER workspace.",
    status: "Live",
  },
  {
    title: "Listing Revisions",
    href: "/pier-manager",
    kicker: "Revisions",
    description: "Route broker corrections, destructive field updates, documents, photos, and publish approvals through the structured revision console.",
    status: "Live",
  },
  {
    title: "Website Creation",
    href: "/pier-manager",
    kicker: "Offering sites",
    description: "Launch Gate 5 website generation from ListingStream payloads, municipal enrichment, and PIER-quality market copy.",
    status: "Live",
  },
  {
    title: "Email Creation",
    href: "/pier-manager",
    kicker: "Campaigns",
    description: "Prepare ListingStream-driven email campaigns and broker announcement copy from the same listing source record.",
    status: "Ready",
  },
  {
    title: "OM Creation",
    href: "/pier-manager",
    kicker: "Memorandums",
    description: "Generate offering memorandum drafts and PDF packets from verified listing facts, documents, and PIER broker context.",
    status: "Live",
  },
];

const marketingCards = [
  {
    title: "WordPress Pulse Drop",
    href: "/workflows",
    kicker: "PIER Pulse",
    description: "Company-level external CRE intelligence publishing lane for WordPress drops, corridor research, municipal stories, zoning activity, and project announcements.",
    status: "Live workflow",
    postTypes: ["Market Update", "Zoning News", "Project Announcement"],
  },
  {
    title: "Instagram Post Generation",
    href: "/pier-workspace",
    kicker: "Coming next",
    description: "Placeholder lane for PIER-branded Instagram visuals and captions generated from approved Pulse and market-intelligence content.",
    status: "Placeholder",
  },
  {
    title: "Facebook Post Generation",
    href: "/pier-workspace",
    kicker: "Coming next",
    description: "Placeholder lane for company Facebook posts, local market commentary, and listing announcement variants.",
    status: "Placeholder",
  },
];

export default function PierWorkspacePage() {
  return (
    <MissionShell
      title="PIER Commercial Workspace"
      subtitle="A dedicated corporate domain inside Mission Control for brokerage operations, ListingStream deliverables, and company marketing."
      currentPath="/pier-workspace"
      actions={[
        { href: "/", label: "Global dashboard", tone: "ghost" },
        { href: "/pier-manager", label: "Open Listing Portal", tone: "primary" },
      ]}
    >
      <div className="space-y-4">
        <section className="relative overflow-hidden rounded-[1.75rem] border border-zinc-200 bg-white p-5 shadow-sm xl:p-6">
          <div className="absolute inset-y-0 right-0 w-1/2 bg-[radial-gradient(circle_at_70%_30%,rgba(203,82,30,0.16),transparent_32%),linear-gradient(135deg,transparent,rgba(203,82,30,0.06))]" />
          <div className="relative grid gap-5 xl:grid-cols-[1.2fr_0.8fr] xl:items-end">
            <div>
              <p className="inline-flex rounded-full border border-[#CB521E]/20 bg-[#CB521E]/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.26em] text-[#CB521E]">
                PIER domain sandbox
              </p>
              <h3 className="mt-3 max-w-4xl text-3xl font-semibold tracking-tight text-zinc-950 xl:text-5xl">
                Brokerage production on the left. Company marketing on the right.
              </h3>
              <p className="mt-3 max-w-3xl text-sm leading-6 text-zinc-600">
                This workspace keeps listing execution, websites, OMs, emails, and revisions in a dedicated PIER Commercial operations zone while company-level marketing has its own clearly marked lane.
              </p>
            </div>
            <div className="grid gap-3 sm:grid-cols-3 xl:grid-cols-1">
              <WorkspaceMetric label="Brokerage cards" value="5" />
              <WorkspaceMetric label="Marketing cards" value="3" />
              <WorkspaceMetric label="Layout priority" value="Desktop" />
            </div>
          </div>
        </section>

        <div className="grid gap-4 2xl:grid-cols-[minmax(0,1.35fr)_minmax(420px,0.65fr)]">
          <section className="rounded-[1.75rem] border border-zinc-200 bg-white p-5 shadow-sm xl:p-6">
            <div className="flex flex-col gap-3 xl:flex-row xl:items-end xl:justify-between">
              <div>
                <p className="text-[11px] uppercase tracking-[0.28em] text-[#CB521E]">Operational zone 01</p>
                <h3 className="mt-2 text-3xl font-semibold tracking-tight text-zinc-950">PIER Commercial Brokerage</h3>
                <p className="mt-2 max-w-3xl text-sm leading-6 text-zinc-600">
                  Structured listing workflows for intake, revision, website creation, email creation, and OM creation.
                </p>
              </div>
              <Link href="/pier-manager" className="w-fit rounded-2xl bg-[#CB521E] px-5 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-[#a94318]">
                Open Listing Portal
              </Link>
            </div>
            <div className="mt-4 grid gap-4 xl:grid-cols-2 2xl:grid-cols-3">
              {brokerageCards.map((card) => (
                <WorkspaceCard key={card.title} {...card} tone="brokerage" />
              ))}
            </div>
          </section>

          <section className="rounded-[1.75rem] border border-zinc-900 bg-zinc-950 p-5 text-white shadow-sm xl:p-6">
            <div>
              <p className="text-[11px] uppercase tracking-[0.28em] text-[#f6a87f]">Operational zone 02</p>
              <h3 className="mt-2 text-3xl font-semibold tracking-tight text-white">PIER Commercial Company Marketing</h3>
              <p className="mt-2 text-sm leading-6 text-zinc-300">
                Company-brand marketing lives apart from listing production so Pulse drops, social content, and future channels do not clutter brokerage execution.
              </p>
            </div>
            <div className="mt-4 grid gap-4">
              {marketingCards.map((card) => (
                <WorkspaceCard key={card.title} {...card} tone="marketing" />
              ))}
            </div>
          </section>
        </div>
      </div>
    </MissionShell>
  );
}

function WorkspaceMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[1.5rem] border border-zinc-200 bg-zinc-50 p-4">
      <p className="text-[10px] uppercase tracking-[0.22em] text-zinc-500">{label}</p>
      <p className="mt-2 text-2xl font-semibold text-zinc-950">{value}</p>
    </div>
  );
}

function WorkspaceCard({
  title,
  href,
  kicker,
  description,
  status,
  postTypes,
  tone,
}: {
  title: string;
  href: string;
  kicker: string;
  description: string;
  status: string;
  postTypes?: string[];
  tone: "brokerage" | "marketing";
}) {
  const isMarketing = tone === "marketing";
  return (
    <Link
      href={href}
      className={
        isMarketing
          ? "group block rounded-[1.6rem] border border-white/10 bg-white/[0.06] p-5 transition hover:-translate-y-0.5 hover:border-[#CB521E]/50 hover:bg-white/[0.09]"
          : "group block rounded-[1.6rem] border border-zinc-200 bg-zinc-50 p-5 transition hover:-translate-y-0.5 hover:border-[#CB521E]/35 hover:bg-white hover:shadow-lg"
      }
    >
      <div className="flex items-start justify-between gap-4">
        <p className={`text-[10px] font-semibold uppercase tracking-[0.22em] ${isMarketing ? "text-[#f6a87f]" : "text-[#CB521E]"}`}>{kicker}</p>
        <span className={`rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] ${isMarketing ? "border-white/10 bg-white/10 text-zinc-200" : "border-zinc-200 bg-white text-zinc-500"}`}>{status}</span>
      </div>
      <h4 className={`mt-5 text-xl font-semibold tracking-tight ${isMarketing ? "text-white" : "text-zinc-950"}`}>{title}</h4>
      <p className={`mt-3 text-sm leading-6 ${isMarketing ? "text-zinc-300" : "text-zinc-600"}`}>{description}</p>
      {postTypes?.length ? (
        <div className="mt-4">
          <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-zinc-400">Post type inputs</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {postTypes.map((postType) => (
              <span key={postType} className="rounded-full border border-[#f6a87f]/25 bg-[#CB521E]/15 px-3 py-1 text-[11px] font-semibold text-[#f6a87f]">
                {postType}
              </span>
            ))}
          </div>
        </div>
      ) : null}
      <p className={`mt-6 text-sm font-semibold transition group-hover:translate-x-1 ${isMarketing ? "text-[#f6a87f]" : "text-[#CB521E]"}`}>Open card →</p>
    </Link>
  );
}
