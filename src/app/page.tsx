import { FilterToggle } from "@/components/filter-toggle";
import { PropertyGrid } from "@/components/property-grid";
import { PublicPropertyMap } from "@/components/public-property-map";
import { listPublicPropertyCards } from "@/lib/properties";

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ transaction?: string }>;
}) {
  const params = await searchParams;
  const transaction = params.transaction === "sale" || params.transaction === "lease" ? params.transaction : "all";
  const properties = await listPublicPropertyCards(transaction);

  return (
    <main className="min-h-screen bg-zinc-100 text-zinc-900">
      <section className="border-b border-zinc-200 bg-white">
        <div className="mx-auto flex max-w-7xl flex-col gap-6 px-6 py-8 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-3xl">
            <p className="text-sm font-semibold uppercase tracking-[0.24em] text-[#CB521E]">PIER Commercial Property Portal</p>
            <h1 className="mt-3 text-4xl font-semibold tracking-tight sm:text-5xl">Available commercial real estate across Coastal Georgia and the Lowcountry.</h1>
            <p className="mt-4 text-base leading-7 text-zinc-600 sm:text-lg">
              Explore active public PIER listings on the map, filter by sale or lease opportunity, then open any card for the full property detail page.
            </p>
          </div>
          <div className="flex flex-col gap-3 lg:items-end">
            <FilterToggle current={transaction} />
            <p className="text-sm text-zinc-500">Showing {properties.length} active public listings</p>
          </div>
        </div>
      </section>

      <section className="mx-auto grid max-w-[1600px] gap-6 px-4 py-6 lg:grid-cols-[420px_minmax(0,1fr)] lg:px-6">
        <aside className="order-2 lg:order-1">
          <div className="rounded-[2rem] border border-zinc-200 bg-white p-4 shadow-sm sm:p-5">
            <div className="mb-4 flex items-center justify-between gap-4">
              <div>
                <h2 className="text-xl font-semibold tracking-tight">Property Grid</h2>
                <p className="text-sm text-zinc-500">Click a property card to view details.</p>
              </div>
            </div>
            <PropertyGrid properties={properties} />
          </div>
        </aside>
        <div className="order-1 lg:order-2">
          <PublicPropertyMap properties={properties} />
        </div>
      </section>
    </main>
  );
}
