import Image from "next/image";

import type { PropertyDetail } from "@/lib/types";
import { PropertyBadge } from "@/components/property-badge";

type PropertyHeroProps = {
  property: PropertyDetail;
  teaserText: string | null;
};

export function PropertyHero({ property, teaserText }: PropertyHeroProps) {
  const heroUrl =
    property.media.heroImageUrl ??
    property.media.images.find((image) => image.urls.xlarge)?.urls.xlarge ??
    property.media.images.find((image) => image.urls.large)?.urls.large ??
    null;

  return (
    <section className="overflow-hidden rounded-[2rem] border border-zinc-200 bg-white shadow-sm">
      <div className="relative aspect-[16/7] bg-zinc-100">
        {heroUrl ? (
          <Image
            src={heroUrl}
            alt={property.title}
            fill
            className="object-cover"
            priority
            sizes="100vw"
          />
        ) : (
          <div className="flex h-full items-center justify-center text-sm font-medium text-zinc-400">No hero image available</div>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/10 to-transparent" />
        <div className="absolute inset-x-0 bottom-0 p-8 text-white">
          <div className="mb-4 flex flex-wrap gap-2">
            {property.transactionTypes.map((type) => (
              <PropertyBadge key={type} label={type === "sale" ? "For Sale" : "For Lease"} />
            ))}
            {property.property.category ? <PropertyBadge label={property.property.category} /> : null}
          </div>
          <h1 className="max-w-4xl text-4xl font-semibold tracking-tight sm:text-5xl">{property.title}</h1>
          <p className="mt-3 max-w-2xl text-sm text-white/90 sm:text-base">{property.address.full ?? "Address unavailable"}</p>
          <p className="mt-4 text-2xl font-semibold">{teaserText ?? "Contact for pricing"}</p>
        </div>
      </div>
    </section>
  );
}
