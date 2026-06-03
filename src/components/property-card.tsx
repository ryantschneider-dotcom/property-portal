import Image from "next/image";
import Link from "next/link";

import type { PropertyCard as PropertyCardType } from "@/lib/types";
import { PropertyBadge } from "@/components/property-badge";

type PropertyCardProps = {
  property: PropertyCardType;
};

const CARD_CLASS_NAME = "group overflow-hidden rounded-3xl border border-zinc-200 bg-white shadow-sm transition hover:-translate-y-0.5 hover:shadow-xl";

export function PropertyCard({ property }: PropertyCardProps) {
  const imageHoverClass = property.underContract ? "" : "group-hover:scale-[1.02]";
  const cardContent = (
    <>
      <div className="relative aspect-[4/3] overflow-hidden bg-zinc-100">
        {property.thumbnailUrl || property.heroImageUrl ? (
          <Image
            src={property.thumbnailUrl ?? property.heroImageUrl ?? ""}
            alt={property.title}
            fill
            className={`object-cover transition duration-300 ${imageHoverClass}`}
            sizes="(max-width: 768px) 100vw, (max-width: 1280px) 50vw, 33vw"
          />
        ) : (
          <div className="flex h-full items-center justify-center text-sm font-medium text-zinc-400">No image available</div>
        )}
        {property.underContract ? (
          <div className="absolute inset-0 z-10 flex items-center justify-center px-6" aria-label="Under contract listing">
            <span className="rounded-full border-2 border-[#CB521E] bg-transparent px-6 py-2 text-center font-sans text-sm font-bold uppercase tracking-[0.22em] text-[#CB521E] shadow-sm sm:text-base">
              UNDER CONTRACT
            </span>
          </div>
        ) : null}
        <div className="absolute left-4 top-4 flex flex-wrap gap-2">
          {property.badges.map((badge) => (
            <PropertyBadge key={badge} label={badge} />
          ))}
        </div>
      </div>

      <div className="space-y-4 p-5">
        <div>
          <h2 className="line-clamp-2 text-xl font-semibold tracking-tight text-zinc-900">{property.title}</h2>
          <p className="mt-2 line-clamp-2 text-sm text-zinc-600">{property.address.full ?? "Address unavailable"}</p>
        </div>

        <div className="grid grid-cols-3 gap-3 rounded-2xl bg-zinc-50 p-4 text-sm">
          <div>
            <p className="text-zinc-500">Building SF</p>
            <p className="mt-1 font-semibold text-zinc-900">{property.stats.buildingSizeSf?.toLocaleString() ?? "—"}</p>
          </div>
          <div>
            <p className="text-zinc-500">Acres</p>
            <p className="mt-1 font-semibold text-zinc-900">{property.stats.lotSizeAcres ?? "—"}</p>
          </div>
          <div>
            <p className="text-zinc-500">Year Built</p>
            <p className="mt-1 font-semibold text-zinc-900">{property.stats.yearBuilt ?? "—"}</p>
          </div>
        </div>

        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.18em] text-zinc-500">Pricing</p>
            <p className="mt-1 text-lg font-semibold text-zinc-900">{property.pricing.teaserText ?? "Contact for details"}</p>
          </div>
          <span className="text-sm font-medium text-zinc-900">{property.underContract ? "Under contract" : "View details →"}</span>
        </div>
      </div>
    </>
  );

  if (property.underContract) {
    return (
      <article className={`${CARD_CLASS_NAME} cursor-default hover:translate-y-0 hover:shadow-sm`}>
        {cardContent}
      </article>
    );
  }

  return (
    <Link href={`/properties/${property.slug}`} className={CARD_CLASS_NAME}>
      {cardContent}
    </Link>
  );
}
