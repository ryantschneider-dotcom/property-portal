import Link from "next/link";

import type { BrokerCountyHealthSnapshot } from "@/lib/admin";

type BrokerHubHomeProps = {
  countyHealth: BrokerCountyHealthSnapshot;
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

export function BrokerHubHome({ countyHealth }: BrokerHubHomeProps) {
  const cards = [
    { href: "/broker/new", title: "New Listing Entry" },
    { href: "/broker/revisions", title: "Listing Revisions" },
  ];

  return (
    <div className="space-y-4">
      <section className="rounded-[2rem] border border-zinc-300 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-zinc-500">County enrichment health</p>
            <h2 className="mt-2 text-xl font-semibold text-zinc-950">{countyHealth.headline}</h2>
            <p className="mt-1 text-sm text-zinc-500">{countyHealth.detail}</p>
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
                <span>{item.liveStatus || item.routingStatus}</span>
              </span>
            ))}
          </div>
        ) : null}
      </section>

      <section className="grid gap-4 md:grid-cols-2">
        {cards.map((card) => (
          <Link
            key={card.href}
            href={card.href}
            className="flex min-h-[220px] items-center justify-center rounded-[2rem] border border-zinc-400 bg-white p-8 text-center text-3xl font-semibold tracking-tight text-zinc-950 shadow-sm transition hover:bg-zinc-50 hover:shadow-md sm:min-h-[260px] sm:text-4xl"
          >
            {card.title}
          </Link>
        ))}
      </section>
    </div>
  );
}
