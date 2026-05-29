import { headers } from "next/headers";

import { OutlookKeeperLog } from "@/components/outlook-keeper-log";

import { BrokerHubHome } from "@/components/broker-hub-home";
import { FilterToggle } from "@/components/filter-toggle";
import { PropertyGrid } from "@/components/property-grid";
import { getBrokerCountyHealthSnapshot, listAdminProperties } from "@/lib/admin";
import { getPortalSession } from "@/lib/portal-session";
import { listPropertyCards } from "@/lib/properties";

async function BrokerHostHome() {
  const session = await getPortalSession();
  const [countyHealth, listings] = await Promise.all([
    getBrokerCountyHealthSnapshot(),
    listAdminProperties(session),
  ]);

  return (
    <div className="min-h-screen bg-zinc-100 text-zinc-950">
      <header className="border-b border-zinc-300 bg-zinc-950 text-white">
        <div className="mx-auto max-w-6xl px-4 py-4 sm:px-6 lg:px-8">
          <p className="text-xs font-semibold uppercase tracking-[0.28em] text-zinc-400">Internal Admin</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">PIER Internal Broker Hub</h1>
        </div>
      </header>
      <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
        <BrokerHubHome countyHealth={countyHealth} listings={listings} />
        <div className="mt-8">
          <OutlookKeeperLog />
        </div>
      </div>
    </div>
  );
}

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ transaction?: string }>;
}) {
  const headerStore = await headers();
  const host = (headerStore.get("x-forwarded-host") || headerStore.get("host") || "").toLowerCase();
  const isBrokerHost = host === "broker.piercommercial.com" || host === "www.broker.piercommercial.com";

  if (isBrokerHost) {
    return <BrokerHostHome />;
  }

  const params = await searchParams;
  const transaction = params.transaction === "sale" || params.transaction === "lease" ? params.transaction : "all";
  const properties = await listPropertyCards(transaction);

  return (
    <main className="min-h-screen bg-zinc-50 text-zinc-900">
      <section className="mx-auto max-w-7xl px-6 py-12 lg:py-16">
        <div className="flex flex-col gap-8 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-3xl">
            <p className="text-sm font-medium uppercase tracking-[0.2em] text-zinc-500">PIER Property Portal</p>
            <h1 className="mt-3 text-4xl font-semibold tracking-tight sm:text-5xl">Commercial listings, rebuilt for a headless frontend.</h1>
            <p className="mt-4 text-base leading-7 text-zinc-600 sm:text-lg">
              Responsive card grid powered by Firestore and Next.js. This first iteration is wired to the live DTOs,
              image variants, and transaction filters we established in the contract.
            </p>
          </div>
          <div className="flex flex-col gap-3 lg:items-end">
            <FilterToggle current={transaction} />
            <p className="text-sm text-zinc-500">Showing {properties.length} active properties</p>
          </div>
        </div>

        <div className="mt-10 rounded-[2rem] border border-zinc-200 bg-white p-6 shadow-sm">
          <PropertyGrid properties={properties} />
        </div>
      </section>
    </main>
  );
}
