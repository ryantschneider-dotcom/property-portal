import Link from "next/link";

import type { AdminPropertyListItem, BrokerCountyHealthSnapshot } from "@/lib/admin";

type BrokerHubHomeProps = {
  countyHealth: BrokerCountyHealthSnapshot;
  listings: AdminPropertyListItem[];
};

function badgeClasses(health: BrokerCountyHealthSnapshot["overallHealth"] | BrokerCountyHealthSnapshot["items"][number]["health"]) {
  switch (health) {
    case "healthy":
      return "border-emerald-200 bg-emerald-50 text-emerald-700";
    case "degraded":
      return "border-rose-200 bg-rose-50 text-rose-700";
    case "pending":
      return "border-amber-200 bg-amber-50 text-amber-700";
    default:
      return "border-zinc-200 bg-zinc-100 text-zinc-700";
  }
}

export function BrokerHubHome({ countyHealth, listings }: BrokerHubHomeProps) {
  const cards = [
    {
      href: "/broker/new",
      title: "New Listing Entry",
      detail: "Capture the core facts, hero image, and optional notes. Mack fills the rest.",
    },
    {
      href: "/broker/revisions",
      title: "Enrich / Edit",
      detail: "Select an existing listing and tell Mack what changed in plain English.",
    },
  ];
  const reviewQueue = listings.filter((item) => item.reviewState !== "ready").slice(0, 6);
  const blockedCount = listings.filter((item) => item.reviewState === "blocked").length;
  const manualCount = listings.filter((item) => item.reviewState === "needs_manual_followup").length;

  return (
    <div className="space-y-5">
      <section className="rounded-[2rem] border border-[color:rgba(217,119,6,0.16)] bg-[linear-gradient(135deg,#fff7ed,#ffffff_55%,#f8fafc)] p-6 shadow-[0_20px_60px_rgba(15,23,42,0.08)]">
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[var(--pier-orange)]">County enrichment health</p>
            <h2 className="mt-2 text-2xl font-semibold tracking-tight text-zinc-950">{countyHealth.headline}</h2>
            <p className="mt-1 text-sm text-zinc-600">{countyHealth.detail}</p>
          </div>
          <span className={`inline-flex w-fit rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] ${badgeClasses(countyHealth.overallHealth)}`}>
            {countyHealth.overallHealth}
          </span>
        </div>

        {countyHealth.items.length ? (
          <div className="mt-4 flex flex-wrap gap-2">
            {countyHealth.items.map((item) => (
              <span
                key={item.county}
                className={`inline-flex flex-wrap items-center gap-1 rounded-full border px-3 py-1 text-xs font-semibold ${badgeClasses(item.health)}`}
                title={item.detail}
              >
                <span>{item.county}</span>
                <span className="opacity-70">·</span>
                <span>{item.assessorSource}</span>
                <span className="opacity-70">·</span>
                <span>{item.liveStatus || item.routingStatus}</span>
              </span>
            ))}
          </div>
        ) : null}
      </section>

      <section className="grid gap-4 md:grid-cols-2">
        {cards.map((card, index) => (
          <Link
            key={card.href}
            href={card.href}
            className={`group flex min-h-[250px] flex-col justify-between overflow-hidden rounded-[2rem] border p-7 shadow-[0_24px_70px_rgba(15,23,42,0.1)] transition hover:-translate-y-0.5 hover:shadow-[0_28px_85px_rgba(15,23,42,0.14)] ${index === 0 ? "border-[color:rgba(217,119,6,0.18)] bg-[linear-gradient(135deg,#111827,#1f2937_58%,#374151)] text-white" : "border-white/70 bg-white text-zinc-950"}`}
          >
            <div>
              <p className={`text-[11px] font-semibold uppercase tracking-[0.24em] ${index === 0 ? "text-orange-200" : "text-[var(--pier-orange)]"}`}>Broker workflow</p>
              <h3 className="mt-3 text-3xl font-semibold tracking-tight">{card.title}</h3>
              <p className={`mt-3 max-w-md text-sm leading-7 ${index === 0 ? "text-zinc-200" : "text-zinc-600"}`}>{card.detail}</p>
            </div>
            <div className={`mt-8 inline-flex w-fit items-center rounded-full px-4 py-2 text-sm font-semibold transition ${index === 0 ? "bg-white text-zinc-950 group-hover:bg-orange-50" : "bg-orange-50 text-[var(--pier-orange)] group-hover:bg-orange-100"}`}>
              Open
            </div>
          </Link>
        ))}
      </section>

      <section className="rounded-[2rem] border border-white/70 bg-white/94 p-6 shadow-[0_20px_60px_rgba(15,23,42,0.08)]">
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-zinc-500">Checkpoint 3 review queue</p>
            <h2 className="mt-2 text-2xl font-semibold tracking-tight text-zinc-950">Research-needed drafts</h2>
            <p className="mt-1 text-sm text-zinc-500">Thin extractions and blocked county pulls show up here before anyone wastes time assuming the draft is ready.</p>
          </div>
          <div className="flex flex-wrap gap-2 text-xs font-semibold uppercase tracking-[0.18em]">
            <span className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-amber-700">Manual follow-up: {manualCount}</span>
            <span className="rounded-full border border-rose-200 bg-rose-50 px-3 py-1 text-rose-700">Blocked: {blockedCount}</span>
          </div>
        </div>

        {reviewQueue.length ? (
          <div className="mt-4 grid gap-3">
            {reviewQueue.map((item) => (
              <Link key={item.id} href={`/admin/properties/${item.id}/edit`} className="rounded-[1.5rem] border border-zinc-200 bg-zinc-50 p-4 transition hover:border-[var(--pier-orange)] hover:bg-white">
                <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                  <div>
                    <p className="text-base font-semibold text-zinc-950">{item.title}</p>
                    <p className="mt-1 text-sm text-zinc-500">{item.address || item.slug}</p>
                  </div>
                  <div className="flex flex-wrap gap-2 text-xs font-semibold">
                    <span className={`rounded-full px-2.5 py-1 ${item.reviewState === "blocked" ? "bg-rose-50 text-rose-700" : "bg-amber-50 text-amber-700"}`}>
                      {item.reviewState === "blocked" ? "Blocked scrape" : "Needs manual follow-up"}
                    </span>
                    <span className="rounded-full bg-zinc-100 px-2.5 py-1 text-zinc-700">Missing: {item.missingFieldCount}</span>
                    <span className="rounded-full bg-zinc-100 px-2.5 py-1 text-zinc-700">Buildout: {item.buildoutReady ? "ready" : "pending"}</span>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        ) : (
          <p className="mt-4 text-sm text-zinc-500">No broker drafts are currently sitting in a research-needed state.</p>
        )}
      </section>
    </div>
  );
}
