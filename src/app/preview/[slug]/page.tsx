import Link from "next/link";
import { notFound } from "next/navigation";

import { FactsGrid } from "@/components/facts-grid";
import { MapPlaceholder } from "@/components/map-placeholder";
import { PropertyDocuments } from "@/components/property-documents";
import { PropertyGallery } from "@/components/property-gallery";
import { PropertyHero } from "@/components/property-hero";
import { PropertyWebsiteLink } from "@/components/property-website-link";
import { isValidDraftPreviewToken } from "@/lib/draft-preview-token";
import { getPropertyBySlug } from "@/lib/properties";

function formatTeaserText(property: Awaited<ReturnType<typeof getPropertyBySlug>>) {
  if (!property) return null;
  if (property.pricing.hideSalePrice) {
    return property.pricing.hiddenPriceLabel ?? "Call for Price";
  }
  if (typeof property.pricing.salePriceDollars === "number") {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      maximumFractionDigits: 0,
    }).format(property.pricing.salePriceDollars);
  }
  return null;
}

export default async function PropertyDraftPreviewPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ previewToken?: string | string[] }>;
}) {
  const { slug } = await params;
  const { previewToken } = await searchParams;
  if (!isValidDraftPreviewToken(slug, previewToken)) {
    notFound();
  }

  const property = await getPropertyBySlug(slug);

  if (!property) {
    notFound();
  }

  const teaserText = formatTeaserText(property);
  const facts = [
    { label: "Square Footage", value: property.property.buildingSizeSf ? property.property.buildingSizeSf.toLocaleString() : "—" },
    { label: "Acres", value: property.property.lotSizeAcres ? String(property.property.lotSizeAcres) : "—" },
    { label: "Year Built", value: property.property.yearBuilt ? String(property.property.yearBuilt) : "—" },
    { label: "Zoning", value: property.property.zoning ?? "—" },
    { label: "Parcel ID", value: property.property.parcelId ?? "—" },
    { label: "Property Type", value: property.property.category ?? "—" },
  ];

  return (
    <main className="min-h-screen bg-zinc-50 text-zinc-900">
      <section className="mx-auto flex max-w-7xl flex-col gap-8 px-6 py-10 lg:py-14">
        <div className="rounded-3xl border border-[#CB521E]/40 bg-[#CB521E]/5 px-5 py-4 text-sm text-[#7a2f10] shadow-sm">
          <p className="text-[10px] font-semibold uppercase tracking-[0.28em] text-[#CB521E]">Draft Preview</p>
          <p className="mt-2 font-semibold">This direct preview renders the broker-saved draft. It remains hidden from the public listing grid until made live.</p>
        </div>

        <div>
          <Link href="/broker" className="text-sm font-medium text-zinc-600 transition hover:text-zinc-900">
            ← Back to broker dashboard
          </Link>
        </div>

        <PropertyHero property={property} teaserText={teaserText} />
        <FactsGrid facts={facts} />

        <div className="grid gap-8 lg:grid-cols-[1.35fr_0.75fr] lg:items-start">
          <div className="space-y-8">
            <section className="rounded-[2rem] border border-zinc-200 bg-white p-8 shadow-sm">
              <p className="text-sm font-medium uppercase tracking-[0.2em] text-zinc-500">Overview</p>
              <div className="mt-5 space-y-5 text-lg leading-8 text-zinc-700">
                {property.content.saleDescription ? <p>{property.content.saleDescription}</p> : null}
                {property.content.leaseDescription ? <p>{property.content.leaseDescription}</p> : null}
                {property.content.locationDescription ? <p>{property.content.locationDescription}</p> : null}
                {property.content.exteriorDescription ? <p>{property.content.exteriorDescription}</p> : null}
              </div>
            </section>

            <section className="space-y-4">
              <div>
                <p className="text-sm font-medium uppercase tracking-[0.2em] text-zinc-500">Gallery</p>
                <h2 className="mt-2 text-3xl font-semibold tracking-tight">High-resolution property imagery</h2>
              </div>
              <PropertyGallery property={property} />
            </section>
          </div>

          <div className="space-y-8 lg:sticky lg:top-6">
            <section className="rounded-[2rem] border border-zinc-200 bg-white p-8 shadow-sm">
              <p className="text-sm font-medium uppercase tracking-[0.2em] text-zinc-500">Pricing & Access</p>
              <h2 className="mt-3 text-3xl font-semibold tracking-tight">{teaserText ?? "Contact for pricing"}</h2>
              <p className="mt-3 text-sm leading-6 text-zinc-600">Premium detail panel for pricing, quick facts, and direct access to the custom property website.</p>
              <dl className="mt-6 space-y-3 text-sm">
                <div><dt className="text-zinc-500">Sale Price</dt><dd className="font-medium text-zinc-900">{property.pricing.salePriceDollars?.toLocaleString() ?? "—"}</dd></div>
                <div><dt className="text-zinc-500">Price / Unit</dt><dd className="font-medium text-zinc-900">{property.pricing.salePricePerUnit ?? "—"}</dd></div>
                <div><dt className="text-zinc-500">Pricing Units</dt><dd className="font-medium text-zinc-900">{property.pricing.salePriceUnits ?? "—"}</dd></div>
                <div><dt className="text-zinc-500">Parcel ID</dt><dd className="font-medium text-zinc-900">{property.property.parcelId ?? "—"}</dd></div>
                <div><dt className="text-zinc-500">Zoning</dt><dd className="font-medium text-zinc-900">{property.property.zoning ?? "—"}</dd></div>
              </dl>
              {property.links.websiteUrl ? <div className="mt-6"><PropertyWebsiteLink url={property.links.websiteUrl} /></div> : null}
            </section>
            <section className="space-y-4">
              <div>
                <p className="text-sm font-medium uppercase tracking-[0.2em] text-zinc-500">Documents</p>
                <h2 className="mt-2 text-2xl font-semibold tracking-tight">Brochures & downloads</h2>
              </div>
              <PropertyDocuments property={property} />
            </section>
          </div>
        </div>

        <section className="space-y-4">
          <div>
            <p className="text-sm font-medium uppercase tracking-[0.2em] text-zinc-500">Map</p>
            <h2 className="mt-2 text-3xl font-semibold tracking-tight">Location layer scaffold</h2>
          </div>
          <MapPlaceholder lat={property.location.lat} lng={property.location.lng} title={property.title} />
        </section>
      </section>
    </main>
  );
}
