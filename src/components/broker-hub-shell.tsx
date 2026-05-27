import Link from "next/link";
import { ReactNode } from "react";

const navItems = [
  { href: "/broker", label: "Dashboard" },
  { href: "/broker/new", label: "New Listing Entry" },
  { href: "/broker/revisions", label: "Enrich / Edit" },
];

export function BrokerHubShell({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <main className="mx-auto max-w-7xl space-y-5 px-4 py-5 sm:px-6 lg:px-8 lg:py-8">
      <section className="overflow-hidden rounded-[2.25rem] border border-[color:rgba(217,119,6,0.14)] bg-[radial-gradient(circle_at_top_left,rgba(251,146,60,0.2),transparent_28%),linear-gradient(135deg,#111827_0%,#1f2937_60%,#374151_100%)] p-6 text-white shadow-[0_30px_90px_rgba(15,23,42,0.22)] sm:p-8">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.32em] text-orange-200">PIER Commercial</p>
            <h1 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">{title}</h1>
            <p className="mt-2 max-w-3xl text-sm leading-7 text-zinc-200">A broker-first workflow designed to feel faster, sharper, and more premium than Buildout.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {navItems.map((item) => {
              const isPrimary = item.label === title;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`inline-flex items-center justify-center rounded-full px-4 py-2.5 text-sm font-semibold transition ${isPrimary ? "bg-[var(--pier-orange)] text-white shadow-lg shadow-orange-900/20" : "border border-white/15 bg-white/10 text-white hover:bg-white/15"}`}
                >
                  {item.label}
                </Link>
              );
            })}
          </div>
        </div>
      </section>

      <section className="rounded-[2rem] border border-white/70 bg-white/70 p-4 shadow-[0_18px_60px_rgba(15,23,42,0.06)] backdrop-blur sm:p-5">
        {children}
      </section>
    </main>
  );
}
