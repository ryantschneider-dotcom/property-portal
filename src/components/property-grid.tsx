import type { PropertyCard as PropertyCardType } from "@/lib/types";
import { PropertyCard } from "@/components/property-card";

type PropertyGridProps = {
  properties: PropertyCardType[];
};

export function PropertyGrid({ properties }: PropertyGridProps) {
  if (!properties.length) {
    return (
      <div className="rounded-3xl border border-dashed border-zinc-300 bg-white p-10 text-center text-zinc-500">
        No properties match the current filter.
      </div>
    );
  }

  return (
    <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
      {properties.map((property) => (
        <PropertyCard key={property.id} property={property} />
      ))}
    </div>
  );
}
