import Link from "next/link";

import { AdminPropertyTable } from "@/components/admin-property-table";
import { listAdminProperties } from "@/lib/admin";

export default async function AdminPropertiesPage() {
  const properties = await listAdminProperties();

  return (
    <main className="px-6 py-10 lg:px-10 lg:py-12">
      <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-sm font-medium uppercase tracking-[0.2em] text-zinc-500">Admin Dashboard</p>
          <h1 className="mt-3 text-4xl font-semibold tracking-tight">Manage property inventory</h1>
          <p className="mt-3 max-w-2xl text-zinc-600">
            Internal listing control center wired directly to Firestore. Edit existing records or create new listings without going through the spreadsheet.
          </p>
        </div>
        <Link
          href="/admin/properties/new"
          className="inline-flex items-center justify-center rounded-full bg-zinc-900 px-5 py-3 text-sm font-semibold text-white transition hover:bg-zinc-700"
        >
          Create New Property
        </Link>
      </div>

      <div className="mt-8">
        <AdminPropertyTable properties={properties} />
      </div>
    </main>
  );
}
