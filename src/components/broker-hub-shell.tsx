import Link from "next/link";
import { ReactNode } from "react";

export function BrokerHubShell({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <main className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <Link href="/broker" className="inline-flex items-center justify-center rounded-lg border border-zinc-400 bg-white px-4 py-2.5 text-sm font-semibold text-zinc-900 transition hover:bg-zinc-50">
          Dashboard
        </Link>
        <Link href="/broker/new" className="inline-flex items-center justify-center rounded-lg bg-zinc-950 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-zinc-800">
          New Listing Entry
        </Link>
        <Link href="/broker/revisions" className="inline-flex items-center justify-center rounded-lg border border-zinc-400 bg-white px-4 py-2.5 text-sm font-semibold text-zinc-900 transition hover:bg-zinc-50">
          Listing Revisions
        </Link>
      </div>

      <section className="rounded-xl border border-zinc-300 bg-white p-4 shadow-sm sm:p-5">
        <h2 className="text-2xl font-semibold tracking-tight text-zinc-950">{title}</h2>
        <div className="mt-4">{children}</div>
      </section>
    </main>
  );
}
