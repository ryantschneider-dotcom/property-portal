import Link from "next/link";

import type { AdminPropertyListItem } from "@/lib/admin";

type AdminPropertyTableProps = {
  properties: AdminPropertyListItem[];
};

export function AdminPropertyTable({ properties }: AdminPropertyTableProps) {
  return (
    <div className="overflow-hidden rounded-3xl border border-zinc-200 bg-white shadow-sm">
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-zinc-200 text-sm">
          <thead className="bg-zinc-50">
            <tr>
              <th className="px-6 py-4 text-left font-semibold text-zinc-600">Property</th>
              <th className="px-6 py-4 text-left font-semibold text-zinc-600">Transaction</th>
              <th className="px-6 py-4 text-left font-semibold text-zinc-600">Parcel ID</th>
              <th className="px-6 py-4 text-left font-semibold text-zinc-600">Zoning</th>
              <th className="px-6 py-4 text-right font-semibold text-zinc-600">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100">
            {properties.map((property) => (
              <tr key={property.id} className="hover:bg-zinc-50/80">
                <td className="px-6 py-5 align-top">
                  <p className="font-semibold text-zinc-900">{property.title}</p>
                  <p className="mt-1 text-zinc-500">{property.address ?? "Address unavailable"}</p>
                  <p className="mt-1 text-xs uppercase tracking-[0.14em] text-zinc-400">{property.slug}</p>
                </td>
                <td className="px-6 py-5 align-top text-zinc-700">{property.transactionLabel ?? "—"}</td>
                <td className="px-6 py-5 align-top text-zinc-700">{property.parcelId ?? "—"}</td>
                <td className="px-6 py-5 align-top text-zinc-700">{property.zoning ?? "—"}</td>
                <td className="px-6 py-5 align-top">
                  <div className="flex justify-end gap-3">
                    <Link
                      href={`/admin/properties/${property.id}/edit`}
                      className="rounded-full border border-zinc-300 px-4 py-2 font-medium text-zinc-700 transition hover:border-zinc-900 hover:text-zinc-900"
                    >
                      Edit
                    </Link>
                    <Link
                      href={`/properties/${property.slug}`}
                      className="rounded-full bg-zinc-900 px-4 py-2 font-medium text-white transition hover:bg-zinc-700"
                    >
                      View
                    </Link>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
