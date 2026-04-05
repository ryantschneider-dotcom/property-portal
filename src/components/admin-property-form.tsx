"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import type { AdminPropertyFormData } from "@/lib/admin";

type AdminPropertyFormProps = {
  initialData: AdminPropertyFormData;
  mode: "edit" | "new";
};

type SaveState = "idle" | "saving" | "saved" | "error";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-2">
      <span className="text-sm font-medium text-zinc-700">{label}</span>
      {children}
    </label>
  );
}

function inputClassName() {
  return "w-full rounded-2xl border border-zinc-300 bg-white px-4 py-3 text-sm text-zinc-900 outline-none transition focus:border-zinc-900";
}

export function AdminPropertyForm({ initialData, mode }: AdminPropertyFormProps) {
  const router = useRouter();
  const [formData, setFormData] = useState<AdminPropertyFormData>(initialData);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  function update<K extends keyof AdminPropertyFormData>(key: K, value: AdminPropertyFormData[K]) {
    setFormData((current) => ({ ...current, [key]: value }));
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaveState("saving");
    setErrorMessage(null);

    const response = await fetch("/api/admin/properties/save", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(formData),
    });

    const payload = await response.json();
    if (!response.ok) {
      setSaveState("error");
      setErrorMessage(payload.error ?? "Unable to save property");
      return;
    }

    setSaveState("saved");
    router.push(`/admin/properties/${payload.slug}/edit?saved=1`);
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-8">
      <div className="grid gap-8 xl:grid-cols-[1.4fr_0.8fr]">
        <div className="space-y-8">
          <section className="rounded-3xl border border-zinc-200 bg-white p-8 shadow-sm">
            <h2 className="text-2xl font-semibold tracking-tight">Core listing information</h2>
            <div className="mt-6 grid gap-5 md:grid-cols-2">
              <Field label="Slug">
                <input className={inputClassName()} value={formData.slug} onChange={(e) => update("slug", e.target.value)} required />
              </Field>
              <Field label="Title">
                <input className={inputClassName()} value={formData.title} onChange={(e) => update("title", e.target.value)} required />
              </Field>
              <Field label="Transaction Type">
                <select className={inputClassName()} value={formData.transactionType} onChange={(e) => update("transactionType", e.target.value as AdminPropertyFormData["transactionType"])}>
                  <option value="sale">For Sale</option>
                  <option value="lease">For Lease</option>
                  <option value="sale-lease">For Sale / Lease</option>
                </select>
              </Field>
              <Field label="Lead Broker">
                <input className={inputClassName()} value={formData.leadBroker} onChange={(e) => update("leadBroker", e.target.value)} />
              </Field>
              <Field label="Website URL">
                <input className={inputClassName()} value={formData.websiteUrl} onChange={(e) => update("websiteUrl", e.target.value)} />
              </Field>
              <Field label="Sale Title">
                <input className={inputClassName()} value={formData.saleTitle} onChange={(e) => update("saleTitle", e.target.value)} />
              </Field>
            </div>
          </section>

          <section className="rounded-3xl border border-zinc-200 bg-white p-8 shadow-sm">
            <h2 className="text-2xl font-semibold tracking-tight">Address & coordinates</h2>
            <div className="mt-6 grid gap-5 md:grid-cols-2">
              <Field label="Street Address">
                <input className={inputClassName()} value={formData.addressStreet} onChange={(e) => update("addressStreet", e.target.value)} />
              </Field>
              <Field label="Full Address">
                <input className={inputClassName()} value={formData.addressFull} onChange={(e) => update("addressFull", e.target.value)} />
              </Field>
              <Field label="City">
                <input className={inputClassName()} value={formData.city} onChange={(e) => update("city", e.target.value)} />
              </Field>
              <Field label="State">
                <input className={inputClassName()} value={formData.state} onChange={(e) => update("state", e.target.value)} />
              </Field>
              <Field label="ZIP">
                <input className={inputClassName()} value={formData.zip} onChange={(e) => update("zip", e.target.value)} />
              </Field>
              <Field label="County">
                <input className={inputClassName()} value={formData.county} onChange={(e) => update("county", e.target.value)} />
              </Field>
              <Field label="Latitude">
                <input className={inputClassName()} value={formData.latitude} onChange={(e) => update("latitude", e.target.value)} />
              </Field>
              <Field label="Longitude">
                <input className={inputClassName()} value={formData.longitude} onChange={(e) => update("longitude", e.target.value)} />
              </Field>
              <Field label="Neighborhood">
                <input className={inputClassName()} value={formData.neighborhood} onChange={(e) => update("neighborhood", e.target.value)} />
              </Field>
              <Field label="Corridor / Submarket">
                <input className={inputClassName()} value={formData.corridor} onChange={(e) => update("corridor", e.target.value)} />
              </Field>
            </div>
          </section>

          <section className="rounded-3xl border border-zinc-200 bg-white p-8 shadow-sm">
            <h2 className="text-2xl font-semibold tracking-tight">Descriptions & bullets</h2>
            <div className="mt-6 space-y-5">
              <Field label="Sale Description">
                <textarea className={`${inputClassName()} min-h-36`} value={formData.saleDescription} onChange={(e) => update("saleDescription", e.target.value)} />
              </Field>
              <Field label="Lease Description">
                <textarea className={`${inputClassName()} min-h-36`} value={formData.leaseDescription} onChange={(e) => update("leaseDescription", e.target.value)} />
              </Field>
              <Field label="Location Description">
                <textarea className={`${inputClassName()} min-h-28`} value={formData.locationDescription} onChange={(e) => update("locationDescription", e.target.value)} />
              </Field>
              <Field label="Exterior Description">
                <textarea className={`${inputClassName()} min-h-28`} value={formData.exteriorDescription} onChange={(e) => update("exteriorDescription", e.target.value)} />
              </Field>
              <Field label="Sale Bullets (one per line)">
                <textarea className={`${inputClassName()} min-h-28`} value={formData.saleBullets} onChange={(e) => update("saleBullets", e.target.value)} />
              </Field>
              <Field label="Lease Bullets (one per line)">
                <textarea className={`${inputClassName()} min-h-28`} value={formData.leaseBullets} onChange={(e) => update("leaseBullets", e.target.value)} />
              </Field>
            </div>
          </section>

          <section className="rounded-3xl border border-zinc-200 bg-white p-8 shadow-sm">
            <h2 className="text-2xl font-semibold tracking-tight">Location intelligence</h2>
            <div className="mt-6 space-y-5">
              <Field label="Anchor Tenants (one per line)">
                <textarea className={`${inputClassName()} min-h-28`} value={formData.anchorTenants} onChange={(e) => update("anchorTenants", e.target.value)} />
              </Field>
              <Field label="Nearby Restaurants (one per line)">
                <textarea className={`${inputClassName()} min-h-28`} value={formData.nearbyRestaurants} onChange={(e) => update("nearbyRestaurants", e.target.value)} />
              </Field>
              <Field label="Nearby Banks (one per line)">
                <textarea className={`${inputClassName()} min-h-28`} value={formData.nearbyBanks} onChange={(e) => update("nearbyBanks", e.target.value)} />
              </Field>
            </div>
          </section>
        </div>

        <div className="space-y-8 xl:sticky xl:top-6 xl:self-start">
          <section className="rounded-3xl border border-zinc-200 bg-white p-8 shadow-sm">
            <h2 className="text-2xl font-semibold tracking-tight">Pricing & facts</h2>
            <div className="mt-6 space-y-5">
              <Field label="Sale Price ($)">
                <input className={inputClassName()} value={formData.salePriceDollars} onChange={(e) => update("salePriceDollars", e.target.value)} />
              </Field>
              <Field label="Hidden Price Label">
                <input className={inputClassName()} value={formData.hiddenPriceLabel} onChange={(e) => update("hiddenPriceLabel", e.target.value)} />
              </Field>
              <label className="flex items-center gap-3 rounded-2xl border border-zinc-200 px-4 py-3 text-sm text-zinc-700">
                <input type="checkbox" checked={formData.hideSalePrice} onChange={(e) => update("hideSalePrice", e.target.checked)} />
                Hide Sale Price
              </label>
              <Field label="Listing Price Visibility">
                <input className={inputClassName()} value={formData.listingPriceVisibility} onChange={(e) => update("listingPriceVisibility", e.target.value)} />
              </Field>
              <Field label="Asking Price / Lease Rate per SF">
                <input className={inputClassName()} value={formData.askingPriceRate} onChange={(e) => update("askingPriceRate", e.target.value)} />
              </Field>
              <Field label="Available SF">
                <input className={inputClassName()} value={formData.availableSf} onChange={(e) => update("availableSf", e.target.value)} />
              </Field>
              <Field label="Lease Type">
                <input className={inputClassName()} value={formData.leaseType} onChange={(e) => update("leaseType", e.target.value)} />
              </Field>
              <Field label="Square Footage">
                <input className={inputClassName()} value={formData.buildingSizeSf} onChange={(e) => update("buildingSizeSf", e.target.value)} />
              </Field>
              <Field label="Acres">
                <input className={inputClassName()} value={formData.lotSizeAcres} onChange={(e) => update("lotSizeAcres", e.target.value)} />
              </Field>
              <Field label="Year Built">
                <input className={inputClassName()} value={formData.yearBuilt} onChange={(e) => update("yearBuilt", e.target.value)} />
              </Field>
              <Field label="Zoning">
                <input className={inputClassName()} value={formData.zoning} onChange={(e) => update("zoning", e.target.value)} />
              </Field>
              <Field label="Parcel ID">
                <input className={inputClassName()} value={formData.parcelId} onChange={(e) => update("parcelId", e.target.value)} />
              </Field>
              <Field label="Property Type ID">
                <input className={inputClassName()} value={formData.propertyTypeId} onChange={(e) => update("propertyTypeId", e.target.value)} />
              </Field>
              <Field label="Property Subtype ID">
                <input className={inputClassName()} value={formData.propertySubtypeId} onChange={(e) => update("propertySubtypeId", e.target.value)} />
              </Field>
              <Field label="Property Type Label">
                <input className={inputClassName()} value={formData.propertyTypeLabel} onChange={(e) => update("propertyTypeLabel", e.target.value)} />
              </Field>
              <Field label="Parking">
                <input className={inputClassName()} value={formData.parking} onChange={(e) => update("parking", e.target.value)} />
              </Field>
              <Field label="Exterior Construction Type">
                <input className={inputClassName()} value={formData.exteriorConstructionType} onChange={(e) => update("exteriorConstructionType", e.target.value)} />
              </Field>
              <Field label="Property Class">
                <input className={inputClassName()} value={formData.propertyClass} onChange={(e) => update("propertyClass", e.target.value)} />
              </Field>
              <Field label="Assessor Improvements (one per line)">
                <textarea className={`${inputClassName()} min-h-28`} value={formData.assessorImprovements} onChange={(e) => update("assessorImprovements", e.target.value)} />
              </Field>
            </div>
          </section>

          <section className="rounded-3xl border border-zinc-200 bg-white p-8 shadow-sm">
            <p className="text-sm font-medium uppercase tracking-[0.18em] text-zinc-500">Save status</p>
            <p className="mt-3 text-sm text-zinc-600">
              {saveState === "idle" && `${mode === "new" ? "Create" : "Update"} the property record directly in Firestore.`}
              {saveState === "saving" && "Saving to Firestore…"}
              {saveState === "saved" && "Saved successfully."}
              {saveState === "error" && (errorMessage ?? "Save failed.")}
            </p>
            <button
              type="submit"
              className="mt-6 inline-flex w-full items-center justify-center rounded-2xl bg-zinc-900 px-5 py-3 text-sm font-semibold text-white transition hover:bg-zinc-700"
            >
              Save Property
            </button>
          </section>
        </div>
      </div>
    </form>
  );
}
