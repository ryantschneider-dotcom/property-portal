export const dynamic = "force-dynamic";

import Link from "next/link";

import { listAdminProperties } from "@/lib/admin";

function displayValue(value: string | null | undefined, fallback = "—") {
  if (value == null || value === "") return fallback;
  return value;
}

export default async function PropertiesDashboard() {
  const properties = await listAdminProperties();

  return (
    <div className="max-w-7xl mx-auto p-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Manage Inventory</h1>
          <p className="text-gray-500 mt-1">PIER Commercial internal listing control center.</p>
        </div>

        <div className="w-full md:w-auto flex gap-2">
          <Link
            href="/admin/intake"
            className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors font-medium whitespace-nowrap"
          >
            + New Listing
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
        {properties.map((property) => (
          <div
            key={property.id}
            className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm hover:shadow-md transition-shadow flex flex-col"
          >
            <div className="h-48 bg-gray-100 relative border-b border-gray-200 flex items-center justify-center overflow-hidden">
              {property.imageUrl ? (
                <img
                  src={property.imageUrl}
                  alt={displayValue(property.title, "Property image")}
                  className="h-full w-full object-cover"
                />
              ) : (
                <div className="text-gray-400 text-sm">No Image</div>
              )}
              <div className="absolute top-2 right-2 bg-black/80 text-white text-xs font-bold px-2 py-1 rounded">
                {displayValue(property.transactionLabel, "N/A")}
              </div>
            </div>

            <div className="p-4 flex-grow flex flex-col">
              <h3 className="font-bold text-gray-900 line-clamp-2 min-h-[3rem]">
                {displayValue(property.title, "Untitled Property")}
              </h3>
              <p className="text-sm text-gray-500 mt-1 truncate">
                {displayValue(property.address, "No address listed")}
              </p>

              <div className="mt-4 pt-4 border-t border-gray-100 grid grid-cols-2 gap-2 text-sm">
                <div>
                  <span className="block text-gray-400 text-xs uppercase tracking-wider">Zoning</span>
                  <span className="font-medium text-gray-900">{displayValue(property.zoning)}</span>
                </div>
                <div>
                  <span className="block text-gray-400 text-xs uppercase tracking-wider">Parcel</span>
                  <span className="font-medium text-gray-900">{displayValue(property.parcelId)}</span>
                </div>
              </div>
            </div>

            <div className="p-4 bg-gray-50 border-t border-gray-100">
              <Link
                href={`/admin/properties/${property.slug || property.id}/edit`}
                className="block w-full rounded-lg border border-gray-900 bg-gray-900 px-4 py-2 text-center text-sm font-semibold tracking-wide !text-white shadow-sm transition-colors hover:bg-black hover:!text-white focus:outline-none focus:ring-2 focus:ring-gray-900 focus:ring-offset-2"
              >
                Edit Details
              </Link>
            </div>
          </div>
        ))}

        {properties.length === 0 && (
          <div className="col-span-full text-center py-12 text-gray-500 bg-gray-50 rounded-xl border border-dashed border-gray-300">
            No properties found.
          </div>
        )}
      </div>
    </div>
  );
}
