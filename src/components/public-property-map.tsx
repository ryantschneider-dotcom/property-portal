import Link from "next/link";

import type { PropertyCard } from "@/lib/types";

type PublicPropertyMapProps = {
  properties: PropertyCard[];
};

function coordinateBounds(properties: PropertyCard[]) {
  const coordinates = properties
    .map((property) => property.location)
    .filter((location): location is { lat: number; lng: number } => typeof location.lat === "number" && typeof location.lng === "number");

  if (!coordinates.length) return null;

  const lats = coordinates.map((coordinate) => coordinate.lat);
  const lngs = coordinates.map((coordinate) => coordinate.lng);
  return {
    minLat: Math.min(...lats),
    maxLat: Math.max(...lats),
    minLng: Math.min(...lngs),
    maxLng: Math.max(...lngs),
  };
}

function pinPosition(property: PropertyCard, bounds: NonNullable<ReturnType<typeof coordinateBounds>>) {
  const latRange = Math.max(bounds.maxLat - bounds.minLat, 0.01);
  const lngRange = Math.max(bounds.maxLng - bounds.minLng, 0.01);
  const lat = typeof property.location.lat === "number" ? property.location.lat : bounds.minLat + latRange / 2;
  const lng = typeof property.location.lng === "number" ? property.location.lng : bounds.minLng + lngRange / 2;

  return {
    left: `${Math.min(92, Math.max(8, ((lng - bounds.minLng) / lngRange) * 84 + 8))}%`,
    top: `${Math.min(88, Math.max(12, 92 - ((lat - bounds.minLat) / latRange) * 80))}%`,
  };
}

export function PublicPropertyMap({ properties }: PublicPropertyMapProps) {
  const bounds = coordinateBounds(properties);
  const pinnedProperties = bounds
    ? properties.filter((property) => typeof property.location.lat === "number" && typeof property.location.lng === "number")
    : [];

  return (
    <section className="overflow-hidden rounded-[2rem] border border-zinc-200 bg-zinc-950 shadow-2xl shadow-zinc-950/10 lg:sticky lg:top-6">
      <div className="flex items-center justify-between gap-4 border-b border-white/10 px-5 py-4 text-white">
        <div>
          <h2 className="text-xl font-semibold tracking-tight">Map View</h2>
          <p className="text-sm text-zinc-400">Select a PIER listing pin or card to view details.</p>
        </div>
        <span className="rounded-full border border-[#CB521E]/40 bg-[#CB521E]/15 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-orange-200">
          {pinnedProperties.length} Pins
        </span>
      </div>
      <div className="relative min-h-[560px] overflow-hidden bg-[radial-gradient(circle_at_30%_20%,rgba(203,82,30,0.28),transparent_28%),linear-gradient(135deg,#1f2937,#111827_48%,#020617)]">
        <div className="absolute inset-0 opacity-30 [background-image:linear-gradient(rgba(255,255,255,0.08)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.08)_1px,transparent_1px)] [background-size:48px_48px]" />
        <div className="absolute inset-x-10 top-1/2 h-1 -rotate-12 rounded-full bg-white/10" />
        <div className="absolute bottom-24 left-0 h-1 w-full rotate-6 rounded-full bg-white/10" />
        <div className="absolute left-1/3 top-0 h-full w-1 rotate-12 rounded-full bg-white/10" />

        {pinnedProperties.map((property) => {
          const position = pinPosition(property, bounds!);
          return (
            <Link
              key={property.id}
              href={`/properties/${property.slug}`}
              className="group absolute z-10 -translate-x-1/2 -translate-y-full"
              style={position}
              aria-label={`View details for ${property.title}`}
            >
              <span className="flex h-11 w-11 items-center justify-center rounded-full border-2 border-white bg-[#CB521E] text-xs font-bold text-white shadow-xl shadow-black/30 transition group-hover:scale-110">
                P
              </span>
              <span className="pointer-events-none absolute left-1/2 top-12 hidden w-56 -translate-x-1/2 rounded-2xl border border-white/10 bg-white p-3 text-left text-xs text-zinc-700 shadow-2xl group-hover:block">
                <strong className="block text-sm text-zinc-950">{property.title}</strong>
                <span className="mt-1 block">{property.address.full ?? property.address.city ?? "Savannah area"}</span>
                <span className="mt-2 inline-flex font-semibold text-[#CB521E]">View details →</span>
              </span>
            </Link>
          );
        })}

        {!pinnedProperties.length ? (
          <div className="absolute inset-0 flex items-center justify-center p-8 text-center text-white">
            <div className="rounded-[2rem] border border-white/10 bg-white/10 p-6 backdrop-blur">
              <p className="text-sm font-semibold uppercase tracking-[0.2em] text-orange-200">Map unavailable</p>
              <p className="mt-3 text-sm text-zinc-200">No active public listings currently include map coordinates.</p>
            </div>
          </div>
        ) : null}
      </div>
    </section>
  );
}
