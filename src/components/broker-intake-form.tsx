"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

type IntakeState = {
  title: string;
  transactionType: "sale" | "lease" | "sale-lease";
  propertyType: string;
  addressStreet: string;
  city: string;
  state: string;
  zip: string;
  county: string;
  parcelId: string;
  suiteNumbers: string;
  listingPriceAmount: string;
  listingPriceVisibility: string;
  askingPriceRate: string;
  availableSf: string;
  buildingSizeSf: string;
  lotSizeAcres: string;
  yearBuilt: string;
  zoning: string;
  leaseType: string;
  websiteUrl: string;
  notes: string;
};

const initialState: IntakeState = {
  title: "",
  transactionType: "sale",
  propertyType: "",
  addressStreet: "",
  city: "",
  state: "GA",
  zip: "",
  county: "",
  parcelId: "",
  suiteNumbers: "",
  listingPriceAmount: "",
  listingPriceVisibility: "",
  askingPriceRate: "",
  availableSf: "",
  buildingSizeSf: "",
  lotSizeAcres: "",
  yearBuilt: "",
  zoning: "",
  leaseType: "",
  websiteUrl: "",
  notes: "",
};

function inputClassName() {
  return "w-full rounded-2xl border border-zinc-300 bg-white px-4 py-3 text-sm text-zinc-900 outline-none transition focus:border-zinc-900";
}

function labelText(text: string, required?: boolean) {
  return (
    <>
      {text}
      {required ? <span className="ml-1 text-red-600">*</span> : null}
    </>
  );
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

export function BrokerIntakeForm() {
  const router = useRouter();
  const [formData, setFormData] = useState<IntakeState>(initialState);
  const [files, setFiles] = useState<File[]>([]);
  const [status, setStatus] = useState<"idle" | "saving" | "error">("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const suggestedSlug = useMemo(() => {
    const titlePart = slugify(formData.title || `${formData.addressStreet} ${formData.city}`.trim());
    return titlePart || "new-listing";
  }, [formData.title, formData.addressStreet, formData.city]);

  const isLease = formData.transactionType === "lease" || formData.transactionType === "sale-lease";
  const isSale = formData.transactionType === "sale" || formData.transactionType === "sale-lease";

  function update<K extends keyof IntakeState>(key: K, value: IntakeState[K]) {
    setFormData((current) => ({ ...current, [key]: value }));
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus("saving");
    setErrorMessage(null);

    try {
      const body = new FormData();
      body.set("payload", JSON.stringify({ ...formData, slug: suggestedSlug }));
      files.forEach((file) => body.append("photos", file));

      const response = await fetch("/api/broker/intake", {
        method: "POST",
        body,
      });

      const payload = await response.json();
      if (!response.ok) {
        setStatus("error");
        setErrorMessage(payload.error ?? "Failed to create draft listing");
        return;
      }

      router.push(`/admin/properties/${payload.slug}/edit?intake=1`);
      router.refresh();
    } catch (error) {
      console.error(error);
      setStatus("error");
      setErrorMessage("Failed to create draft listing");
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-8">
      <section className="rounded-3xl border border-zinc-200 bg-white p-8 shadow-sm">
        <h2 className="text-2xl font-semibold tracking-tight">Broker Intake Form</h2>
        <p className="mt-2 text-sm text-zinc-500">
          Submit the minimum needed. The system will create a draft listing, attach photos, and prepare the record for enrichment and review.
        </p>

        <div className="mt-6 grid gap-5 md:grid-cols-2">
          <label className="block space-y-2">
            <span className="text-sm font-medium text-zinc-700">{labelText("Property Title", true)}</span>
            <input className={inputClassName()} value={formData.title} onChange={(e) => update("title", e.target.value)} required />
          </label>
          <label className="block space-y-2">
            <span className="text-sm font-medium text-zinc-700">Suggested Slug</span>
            <input className={`${inputClassName()} bg-zinc-50`} value={suggestedSlug} readOnly />
          </label>
          <label className="block space-y-2">
            <span className="text-sm font-medium text-zinc-700">Transaction Type</span>
            <select className={inputClassName()} value={formData.transactionType} onChange={(e) => update("transactionType", e.target.value as IntakeState["transactionType"])}>
              <option value="sale">For Sale</option>
              <option value="lease">For Lease</option>
              <option value="sale-lease">For Sale / Lease</option>
            </select>
          </label>
          <label className="block space-y-2">
            <span className="text-sm font-medium text-zinc-700">Property Type</span>
            <input className={inputClassName()} value={formData.propertyType} onChange={(e) => update("propertyType", e.target.value)} required />
          </label>
          <label className="block space-y-2 md:col-span-2">
            <span className="text-sm font-medium text-zinc-700">{labelText("Street Address", true)}</span>
            <input className={inputClassName()} value={formData.addressStreet} onChange={(e) => update("addressStreet", e.target.value)} required />
          </label>
          <label className="block space-y-2">
            <span className="text-sm font-medium text-zinc-700">{labelText("City", true)}</span>
            <input className={inputClassName()} value={formData.city} onChange={(e) => update("city", e.target.value)} required />
          </label>
          <label className="block space-y-2">
            <span className="text-sm font-medium text-zinc-700">{labelText("State", true)}</span>
            <input className={inputClassName()} value={formData.state} onChange={(e) => update("state", e.target.value)} required />
          </label>
          <label className="block space-y-2">
            <span className="text-sm font-medium text-zinc-700">ZIP</span>
            <input className={inputClassName()} value={formData.zip} onChange={(e) => update("zip", e.target.value)} />
          </label>
          <label className="block space-y-2">
            <span className="text-sm font-medium text-zinc-700">County</span>
            <input className={inputClassName()} value={formData.county} onChange={(e) => update("county", e.target.value)} />
          </label>
          <label className="block space-y-2">
            <span className="text-sm font-medium text-zinc-700">{labelText("Property Tax ID# (Parcel ID)", true)}</span>
            <input className={inputClassName()} value={formData.parcelId} onChange={(e) => update("parcelId", e.target.value)} required />
          </label>
          <label className="block space-y-2">
            <span className="text-sm font-medium text-zinc-700">{labelText("Suite Number(s)", isLease)}</span>
            <input className={inputClassName()} value={formData.suiteNumbers} onChange={(e) => update("suiteNumbers", e.target.value)} required={isLease} />
          </label>
          <label className="block space-y-2">
            <span className="text-sm font-medium text-zinc-700">{labelText("Sale Price", isSale)}</span>
            <input className={inputClassName()} value={formData.listingPriceAmount} onChange={(e) => update("listingPriceAmount", e.target.value)} required={isSale} />
          </label>
          <label className="block space-y-2">
            <span className="text-sm font-medium text-zinc-700">Listing Price Visibility</span>
            <input className={inputClassName()} value={formData.listingPriceVisibility} onChange={(e) => update("listingPriceVisibility", e.target.value)} />
          </label>
          <label className="block space-y-2">
            <span className="text-sm font-medium text-zinc-700">{labelText("Asking Lease Rate", isLease)}</span>
            <input className={inputClassName()} value={formData.askingPriceRate} onChange={(e) => update("askingPriceRate", e.target.value)} required={isLease} />
          </label>
          <label className="block space-y-2">
            <span className="text-sm font-medium text-zinc-700">{labelText("Available Size (SF)", isLease)}</span>
            <input className={inputClassName()} value={formData.availableSf} onChange={(e) => update("availableSf", e.target.value)} required={isLease} />
          </label>
          <label className="block space-y-2">
            <span className="text-sm font-medium text-zinc-700">Building SF</span>
            <input className={inputClassName()} value={formData.buildingSizeSf} onChange={(e) => update("buildingSizeSf", e.target.value)} />
          </label>
          <label className="block space-y-2">
            <span className="text-sm font-medium text-zinc-700">Lot Size Acres</span>
            <input className={inputClassName()} value={formData.lotSizeAcres} onChange={(e) => update("lotSizeAcres", e.target.value)} />
          </label>
          <label className="block space-y-2">
            <span className="text-sm font-medium text-zinc-700">Year Built</span>
            <input className={inputClassName()} value={formData.yearBuilt} onChange={(e) => update("yearBuilt", e.target.value)} />
          </label>
          <label className="block space-y-2">
            <span className="text-sm font-medium text-zinc-700">Zoning</span>
            <input className={inputClassName()} value={formData.zoning} onChange={(e) => update("zoning", e.target.value)} />
          </label>
          <label className="block space-y-2">
            <span className="text-sm font-medium text-zinc-700">{labelText("Lease Type", isLease)}</span>
            <select className={inputClassName()} value={formData.leaseType} onChange={(e) => update("leaseType", e.target.value)} required={isLease}>
              <option value="">Select lease type</option>
              <option value="NNN">NNN</option>
              <option value="Gross">Gross</option>
              <option value="Modified Gross">Modified Gross</option>
              <option value="Full Service">Full Service</option>
              <option value="Net">Net</option>
            </select>
          </label>
          <label className="block space-y-2 md:col-span-2">
            <span className="text-sm font-medium text-zinc-700">Website URL</span>
            <input className={inputClassName()} value={formData.websiteUrl} onChange={(e) => update("websiteUrl", e.target.value)} />
          </label>
          <label className="block space-y-2 md:col-span-2">
            <span className="text-sm font-medium text-zinc-700">Broker Notes</span>
            <textarea className={`${inputClassName()} min-h-28`} value={formData.notes} onChange={(e) => update("notes", e.target.value)} />
          </label>
          <label className="block space-y-2 md:col-span-2">
            <span className="text-sm font-medium text-zinc-700">Photos</span>
            <input
              className={inputClassName()}
              type="file"
              multiple
              accept="image/*"
              onChange={(e) => setFiles(Array.from(e.target.files ?? []))}
            />
            <p className="text-xs text-zinc-500">Selected: {files.length} file(s)</p>
          </label>
        </div>
      </section>

      <section className="rounded-3xl border border-zinc-200 bg-white p-8 shadow-sm">
        <p className="text-sm font-medium uppercase tracking-[0.18em] text-zinc-500">Draft creation</p>
        <p className="mt-3 text-sm text-zinc-600">
          {status === "idle" && "Submitting this form creates a draft listing owned by the logged-in broker."}
          {status === "saving" && "Creating draft listing…"}
          {status === "error" && (errorMessage ?? "Failed to create draft listing")}
        </p>
        <button
          type="submit"
          className="mt-6 inline-flex w-full items-center justify-center rounded-2xl bg-zinc-900 px-5 py-3 text-sm font-semibold text-white transition hover:bg-zinc-700"
        >
          Create Draft Listing
        </button>
      </section>
    </form>
  );
}
