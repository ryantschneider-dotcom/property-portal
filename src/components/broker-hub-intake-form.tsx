"use client";

import { ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import {
  BROKER_HUB_BROKERS,
  BROKER_HUB_COUNTIES,
  BROKER_HUB_LEASE_TYPES,
  BROKER_HUB_PROPERTY_TYPES,
  BROKER_HUB_STATES,
  buildListingSlug,
} from "@/lib/broker-hub-shared";

type SuiteRow = {
  id: string;
  suiteNumber: string;
  availableSqFt: string;
  baseRent: string;
  rentType: string;
  unpriced: boolean;
};

type IntakeState = {
  addressStreet: string;
  city: string;
  state: "GA" | "SC";
  zip: string;
  county: string;
  parcelId: string;
  propertyType: string;
  transactionType: "Sale" | "Lease";
  salePrice: string;
  saleUnpriced: boolean;
  grossAcres: string;
  brokerNotes: string;
  leadBroker: string;
  listingTitle: string;
  propertyDescription: string;
  neighborhoodDescription: string;
  areaBusinessesRetail: string;
  roadwaysTransportation: string;
  bulletPoints: string;
};

type ReviewChecklist = {
  successfulScrapes: string[];
  partialScrapes: string[];
  blockedScrapes: string[];
  manualResearchNeeded: string[];
  autoFilledFields: string[];
  failedAutoFillFields: string[];
  humanConfirmationNeeded: string[];
  buildoutReadyFields: string[];
  buildoutMissingFields: string[];
  exceptionReason: string | null;
  checklistState: "ready" | "needs_manual_followup" | "blocked";
};

type DuplicateMatch = {
  id: string;
  slug: string;
  title: string | null;
  address: string | null;
  parcelId: string | null;
  workflowStatus: string | null;
  status: string | null;
  archived: boolean;
  matchedOn: Array<"address" | "parcel">;
};

const initialState: IntakeState = {
  addressStreet: "",
  city: "",
  state: "GA",
  zip: "",
  county: "",
  parcelId: "",
  propertyType: "",
  transactionType: "Sale",
  salePrice: "",
  saleUnpriced: false,
  grossAcres: "",
  brokerNotes: "",
  leadBroker: "",
  listingTitle: "",
  propertyDescription: "",
  neighborhoodDescription: "",
  areaBusinessesRetail: "",
  roadwaysTransportation: "",
  bulletPoints: "",
};

function inputClassName(required = false, invalid = false) {
  return `w-full rounded-[1.15rem] border bg-white px-4 py-3.5 text-sm text-zinc-950 shadow-[0_12px_30px_rgba(17,24,39,0.06)] outline-none transition placeholder:text-zinc-400 focus:border-[var(--pier-orange)] focus:ring-4 focus:ring-[color:rgba(217,119,6,0.14)] ${invalid ? "border-red-400 bg-red-50" : required ? "border-zinc-400" : "border-zinc-200"}`;
}

function sectionCardClassName(tint: "white" | "warm" = "white") {
  return `rounded-[2rem] border p-5 shadow-[0_20px_60px_rgba(15,23,42,0.08)] sm:p-6 ${tint === "warm" ? "border-[color:rgba(217,119,6,0.18)] bg-[linear-gradient(180deg,rgba(255,247,237,0.96),rgba(255,255,255,0.98))]" : "border-white/70 bg-white/94"}`;
}

function createSuite(): SuiteRow {
  return { id: Math.random().toString(36).slice(2), suiteNumber: "", availableSqFt: "", baseRent: "", rentType: "", unpriced: false };
}

function RequiredLabel({ children, required = true }: { children: ReactNode; required?: boolean }) {
  return <span className="text-sm font-semibold text-zinc-800">{children}{required ? <span className="text-[var(--pier-orange)]"> *</span> : null}</span>;
}

function HelperText({ children }: { children: ReactNode }) {
  return <p className="text-xs leading-5 text-zinc-500">{children}</p>;
}

export function BrokerHubIntakeForm() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [formData, setFormData] = useState<IntakeState>(initialState);
  const [suites, setSuites] = useState<SuiteRow[]>([createSuite()]);
  const [files, setFiles] = useState<File[]>([]);
  const [dragActive, setDragActive] = useState(false);
  const [status, setStatus] = useState<"idle" | "saving" | "success" | "error">("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [createdSlug, setCreatedSlug] = useState<string | null>(null);
  const [reviewChecklist, setReviewChecklist] = useState<ReviewChecklist | null>(null);
  const [duplicateMatch, setDuplicateMatch] = useState<DuplicateMatch | null>(null);

  const isSale = formData.transactionType === "Sale";
  const isLease = formData.transactionType === "Lease";
  const isLand = formData.propertyType === "Land";
  const suggestedSlug = useMemo(() => buildListingSlug(formData.addressStreet, formData.city, formData.propertyType), [formData.addressStreet, formData.city, formData.propertyType]);
  const imageFiles = files.filter((file) => file.type.startsWith("image/"));
  const requiredSummary = [
    "Street Address",
    "City",
    "State",
    "County",
    "Parcel ID",
    "Property Type",
    "Transaction Type",
    "Lead Broker",
    "Hero Photo",
    ...(isSale ? ["Sale Price or Unpriced / Inquire"] : ["At least one complete suite row"]),
  ];

  function fileKey(file: File) {
    return `${file.name}-${file.size}-${file.lastModified}`;
  }

  function update<K extends keyof IntakeState>(key: K, value: IntakeState[K]) {
    setFormData((current) => ({ ...current, [key]: value }));
  }

  function addFiles(nextFiles: File[]) {
    setFiles((current) => {
      const existing = new Set(current.map((file) => fileKey(file)));
      return [...current, ...nextFiles.filter((file) => !existing.has(fileKey(file)))];
    });
  }

  function removeFile(target: File) {
    setFiles((current) => current.filter((entry) => entry !== target));
  }

  useEffect(() => {
    if (formData.saleUnpriced && formData.salePrice) {
      update("salePrice", "");
    }
  }, [formData.saleUnpriced]);

  function updateSuite(id: string, key: keyof Omit<SuiteRow, "id">, value: string | boolean) {
    setSuites((current) => current.map((suite) => {
      if (suite.id !== id) return suite;
      if (key === "unpriced") {
        return { ...suite, unpriced: value as boolean, baseRent: value ? "" : suite.baseRent };
      }
      return { ...suite, [key]: value };
    }));
  }

  function removeSuite(id: string) {
    setSuites((current) => (current.length === 1 ? current : current.filter((suite) => suite.id !== id)));
  }

  async function submitIntake(duplicateDecision?: "restore_existing" | "create_duplicate") {
    setStatus("saving");
    setErrorMessage(null);
    setCreatedSlug(null);
    setReviewChecklist(null);
    if (!duplicateDecision) {
      setDuplicateMatch(null);
    }

    try {
      const body = new FormData();
      body.set(
        "payload",
        JSON.stringify({
          ...formData,
          slug: suggestedSlug,
          heroPhotoKey: imageFiles[0] ? fileKey(imageFiles[0]) : null,
          duplicateDecision,
          duplicateSlug: duplicateMatch?.slug ?? null,
          suites: suites.filter((suite) => suite.suiteNumber.trim() || suite.availableSqFt.trim() || suite.baseRent.trim()),
        }),
      );
      files.forEach((file) => body.append("assets", file));

      const response = await fetch("/api/broker/intake", { method: "POST", body });
      const payload = await response.json();
      if (!response.ok) {
        if (response.status === 409 && payload.duplicateMatch) {
          setStatus("error");
          setDuplicateMatch(payload.duplicateMatch as DuplicateMatch);
          setErrorMessage(payload.error ?? "Potential duplicate found.");
          return;
        }
        setStatus("error");
        setErrorMessage(payload.error ?? "Failed to create broker intake draft.");
        return;
      }

      setStatus("success");
      setDuplicateMatch(null);
      setCreatedSlug(payload.slug ?? null);
      setReviewChecklist(payload.reviewChecklist ?? null);
      setFormData(initialState);
      setSuites([createSuite()]);
      setFiles([]);
      router.refresh();
    } catch (error) {
      console.error(error);
      setStatus("error");
      setErrorMessage("Failed to create broker intake draft.");
    }
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await submitIntake();
  }

  return (
    <form onSubmit={handleSubmit} className="mx-auto flex max-w-6xl flex-col gap-5">
      <section className="overflow-hidden rounded-[2.25rem] border border-[color:rgba(217,119,6,0.2)] bg-[radial-gradient(circle_at_top_left,rgba(251,146,60,0.24),transparent_38%),linear-gradient(135deg,#111827_0%,#1f2937_58%,#374151_100%)] p-6 text-white shadow-[0_28px_90px_rgba(15,23,42,0.28)] sm:p-8">
        <div className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr] lg:items-end">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.32em] text-orange-200">PIER Broker Hub</p>
            <h3 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">Launch a listing that already feels half-finished.</h3>
            <p className="mt-3 max-w-3xl text-sm leading-7 text-zinc-200 sm:text-base">
              Mack, your Senior Associate Broker Assistant, will automatically scrape public records to fill in missing property details, research the trade area, and generate polished marketing copy where you leave blanks.
            </p>
          </div>
          <div className="rounded-[1.75rem] border border-white/15 bg-white/10 p-4 backdrop-blur">
            <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-orange-200">Minimum to submit</p>
            <p className="mt-3 text-sm leading-7 text-zinc-100">{requiredSummary.join(" · ")}</p>
          </div>
        </div>
      </section>

      <section className={sectionCardClassName("warm")}>
        <div className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
          <div className="rounded-[1.6rem] border border-[color:rgba(217,119,6,0.22)] bg-white/80 p-5">
            <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-[var(--pier-orange)]">Mack is working</p>
            <h3 className="mt-2 text-xl font-semibold tracking-tight text-zinc-950">Leave the repetitive parts to me.</h3>
            <ul className="mt-4 space-y-2 text-sm leading-7 text-zinc-700">
              <li>• Public-record scrape for parcel, lot, building size, year built, and zoning</li>
              <li>• Google Maps research for neighborhood context, retail, and transportation notes</li>
              <li>• Draft title, descriptions, and bullet points when you leave them blank</li>
            </ul>
          </div>
          <div className="rounded-[1.6rem] border border-zinc-200 bg-[linear-gradient(180deg,#ffffff,#f8fafc)] p-5">
            <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-zinc-500">Broker note</p>
            <p className="mt-2 text-sm leading-7 text-zinc-700">
              If you know the nuance, type it. If you do not, keep moving — Mack will enrich the draft and flag any true blockers instead of making you guess.
            </p>
          </div>
        </div>
      </section>

      <section className={sectionCardClassName()}>
        <div className="mb-5 border-b border-zinc-200 pb-4">
          <h3 className="text-lg font-semibold text-zinc-950">1. Property basics</h3>
          <p className="mt-1 text-sm text-zinc-500">The hard facts. Parcel format can be entered naturally — backend normalization handles county-specific cleanup.</p>
        </div>
        <div className="flex flex-col gap-4">
          <label className="space-y-2">
            <RequiredLabel>Street address</RequiredLabel>
            <input className={inputClassName(true)} value={formData.addressStreet} onChange={(event) => update("addressStreet", event.target.value)} required />
          </label>
          <div className="grid gap-4 sm:grid-cols-3">
            <label className="space-y-2">
              <RequiredLabel>City</RequiredLabel>
              <input className={inputClassName(true)} value={formData.city} onChange={(event) => update("city", event.target.value)} required />
            </label>
            <label className="space-y-2">
              <RequiredLabel>State</RequiredLabel>
              <select className={inputClassName(true)} value={formData.state} onChange={(event) => update("state", event.target.value as "GA" | "SC")} required>
                {BROKER_HUB_STATES.map((state) => <option key={state} value={state}>{state}</option>)}
              </select>
            </label>
            <label className="space-y-2">
              <span className="text-sm font-semibold text-zinc-800">ZIP</span>
              <input className={inputClassName()} value={formData.zip} onChange={(event) => update("zip", event.target.value)} inputMode="numeric" />
            </label>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="space-y-2">
              <RequiredLabel>County</RequiredLabel>
              <select className={inputClassName(true)} value={formData.county} onChange={(event) => update("county", event.target.value)} required>
                <option value="">Select county</option>
                {BROKER_HUB_COUNTIES.map((county) => <option key={county} value={county}>{county}</option>)}
              </select>
            </label>
            <label className="space-y-2">
              <RequiredLabel>Parcel ID</RequiredLabel>
              <input className={inputClassName(true)} value={formData.parcelId} onChange={(event) => update("parcelId", event.target.value)} required />
            </label>
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            <label className="space-y-2">
              <RequiredLabel>Lead broker</RequiredLabel>
              <select className={inputClassName(true)} value={formData.leadBroker} onChange={(event) => update("leadBroker", event.target.value)} required>
                <option value="">Select broker</option>
                {BROKER_HUB_BROKERS.map((broker) => <option key={broker} value={broker}>{broker}</option>)}
              </select>
            </label>
            <label className="space-y-2">
              <RequiredLabel>Property type</RequiredLabel>
              <select className={inputClassName(true)} value={formData.propertyType} onChange={(event) => update("propertyType", event.target.value)} required>
                <option value="">Select type</option>
                {BROKER_HUB_PROPERTY_TYPES.map((propertyType) => <option key={propertyType} value={propertyType}>{propertyType}</option>)}
              </select>
            </label>
            <label className="space-y-2">
              <RequiredLabel>Transaction type</RequiredLabel>
              <select className={inputClassName(true)} value={formData.transactionType} onChange={(event) => update("transactionType", event.target.value as "Sale" | "Lease")} required>
                <option value="Sale">For Sale</option>
                <option value="Lease">For Lease</option>
              </select>
            </label>
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            <label className="space-y-2">
              <RequiredLabel required={false}>Listing Title</RequiredLabel>
              <input className={inputClassName()} value={formData.listingTitle} onChange={(event) => update("listingTitle", event.target.value)} placeholder="Optional custom listing title" />
              <HelperText>If left blank, Mack will auto-generate the listing title.</HelperText>
            </label>
            {isLand ? (
              <label className="space-y-2">
                <RequiredLabel>Gross acres</RequiredLabel>
                <input className={inputClassName(true)} value={formData.grossAcres} onChange={(event) => update("grossAcres", event.target.value)} inputMode="decimal" required />
              </label>
            ) : (
              <label className="space-y-2">
                <span className="text-sm font-semibold text-zinc-800">Draft slug</span>
                <input className={`${inputClassName()} bg-zinc-100`} value={suggestedSlug} readOnly />
                <HelperText>Generated from address, city, and property type.</HelperText>
              </label>
            )}
          </div>
        </div>
      </section>

      <section className={sectionCardClassName()}>
        <div className="mb-5 border-b border-zinc-200 pb-4">
          <h3 className="text-lg font-semibold text-zinc-950">2. Pricing / deal structure</h3>
          <p className="mt-1 text-sm text-zinc-500">Show only the deal fields that matter for the chosen transaction type.</p>
        </div>
        {isSale ? (
          <div className="space-y-4">
            <label className="space-y-2">
              <RequiredLabel required={!formData.saleUnpriced}>Sale price</RequiredLabel>
              <input className={inputClassName(true, !formData.saleUnpriced && !formData.salePrice)} value={formData.salePrice} onChange={(event) => update("salePrice", event.target.value)} inputMode="decimal" disabled={formData.saleUnpriced} required={!formData.saleUnpriced} />
            </label>
            <label className="flex items-center gap-3 rounded-[1.2rem] border border-zinc-200 bg-zinc-50 px-4 py-3.5 text-sm text-zinc-800">
              <input type="checkbox" checked={formData.saleUnpriced} onChange={(event) => update("saleUnpriced", event.target.checked)} />
              <span>Unpriced / Inquire</span>
            </label>
          </div>
        ) : null}
        {isLease ? (
          <div className="space-y-3 rounded-[1.5rem] border border-zinc-200 bg-zinc-50 p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h4 className="text-sm font-semibold text-zinc-900">Suites</h4>
                <p className="text-xs text-zinc-500">Each lease listing needs at least one complete suite row.</p>
              </div>
              <button type="button" onClick={() => setSuites((current) => [...current, createSuite()])} className="inline-flex items-center rounded-full border border-[var(--pier-orange)] px-4 py-2 text-sm font-semibold text-[var(--pier-orange)] transition hover:bg-orange-50">
                + Add another suite
              </button>
            </div>
            <div className="space-y-3">
              {suites.map((suite, index) => (
                <div key={suite.id} className="grid gap-3 rounded-[1.4rem] border border-zinc-200 bg-white p-4 md:grid-cols-2 xl:grid-cols-5">
                  <label className="space-y-2">
                    <RequiredLabel>Suite #</RequiredLabel>
                    <input className={inputClassName(true)} value={suite.suiteNumber} onChange={(event) => updateSuite(suite.id, "suiteNumber", event.target.value)} placeholder="Suite number" required={index === 0} />
                  </label>
                  <label className="space-y-2">
                    <RequiredLabel>Suite size</RequiredLabel>
                    <input className={inputClassName(true)} value={suite.availableSqFt} onChange={(event) => updateSuite(suite.id, "availableSqFt", event.target.value)} placeholder="Square feet" inputMode="numeric" required={index === 0} />
                  </label>
                  <label className="space-y-2">
                    <RequiredLabel required={!suite.unpriced}>Base rent</RequiredLabel>
                    <input className={inputClassName(true)} value={suite.baseRent} onChange={(event) => updateSuite(suite.id, "baseRent", event.target.value)} placeholder="$/SF or monthly" inputMode="decimal" disabled={suite.unpriced} required={index === 0 && !suite.unpriced} />
                  </label>
                  <label className="space-y-2">
                    <RequiredLabel>Rent type</RequiredLabel>
                    <select className={inputClassName(true)} value={suite.rentType} onChange={(event) => updateSuite(suite.id, "rentType", event.target.value)} required={index === 0}>
                      <option value="">Select rent type</option>
                      {BROKER_HUB_LEASE_TYPES.map((leaseType) => <option key={leaseType} value={leaseType}>{leaseType}</option>)}
                    </select>
                  </label>
                  <div className="flex flex-col justify-end gap-2">
                    <label className="flex items-center gap-2 rounded-[1rem] border border-zinc-200 bg-zinc-50 px-3 py-3 text-sm text-zinc-800">
                      <input type="checkbox" checked={suite.unpriced} onChange={(event) => updateSuite(suite.id, "unpriced", event.target.checked)} />
                      <span>Unpriced / Inquire</span>
                    </label>
                    <button type="button" onClick={() => removeSuite(suite.id)} className="inline-flex items-center justify-center rounded-[1rem] border border-zinc-300 px-3 py-3 text-sm font-semibold text-zinc-700 transition hover:border-red-500 hover:text-red-600">
                      Remove
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </section>

      <section className={sectionCardClassName()}>
        <div className="mb-5 border-b border-zinc-200 pb-4">
          <h3 className="text-lg font-semibold text-zinc-950">3. Narrative inputs</h3>
          <p className="mt-1 text-sm text-zinc-500">All fields below are optional. Leave any blank and Mack will research Google Maps and generate them automatically.</p>
        </div>
        <div className="grid gap-4 lg:grid-cols-2">
          <label className="space-y-2 lg:col-span-2">
            <RequiredLabel required={false}>Property Description</RequiredLabel>
            <textarea className={`${inputClassName()} min-h-32`} value={formData.propertyDescription} onChange={(event) => update("propertyDescription", event.target.value)} placeholder="Optional broker-written property description" />
          </label>
          <label className="space-y-2">
            <RequiredLabel required={false}>Neighborhood Description</RequiredLabel>
            <textarea className={`${inputClassName()} min-h-32`} value={formData.neighborhoodDescription} onChange={(event) => update("neighborhoodDescription", event.target.value)} placeholder="Optional neighborhood overview" />
          </label>
          <label className="space-y-2">
            <RequiredLabel required={false}>Area Businesses / Retail</RequiredLabel>
            <textarea className={`${inputClassName()} min-h-32`} value={formData.areaBusinessesRetail} onChange={(event) => update("areaBusinessesRetail", event.target.value)} placeholder="Optional nearby retail, restaurants, anchors, or business context" />
          </label>
          <label className="space-y-2">
            <RequiredLabel required={false}>Roadways / Transportation</RequiredLabel>
            <textarea className={`${inputClassName()} min-h-32`} value={formData.roadwaysTransportation} onChange={(event) => update("roadwaysTransportation", event.target.value)} placeholder="Optional access, interstates, ports, airports, transit, or commuting notes" />
          </label>
          <label className="space-y-2">
            <RequiredLabel required={false}>Bullet Points</RequiredLabel>
            <textarea className={`${inputClassName()} min-h-32`} value={formData.bulletPoints} onChange={(event) => update("bulletPoints", event.target.value)} placeholder="One bullet per line. Example: Strong frontage\nSignalized intersection\nNearby national retailers" />
            <HelperText>Enter one bullet per line if you want to seed the marketing bullets.</HelperText>
          </label>
        </div>
      </section>

      <section className={sectionCardClassName()}>
        <div className="mb-5 border-b border-zinc-200 pb-4">
          <h3 className="text-lg font-semibold text-zinc-950">4. Internal notes</h3>
          <p className="mt-1 text-sm text-zinc-500">This is where the real context goes.</p>
        </div>
        <label className="block space-y-2">
          <span className="text-sm font-semibold text-zinc-800">Broker notes / brain dump</span>
          <textarea className={`${inputClassName()} min-h-40`} value={formData.brokerNotes} onChange={(event) => update("brokerNotes", event.target.value)} placeholder="Ownership issues, timing, access, tenant status, pricing reality, missing facts." />
        </label>
      </section>

      <section className={sectionCardClassName()}>
        <div className="mb-5 border-b border-zinc-200 pb-4">
          <h3 className="text-lg font-semibold text-zinc-950">5. Photos and files</h3>
          <p className="mt-1 text-sm text-zinc-500">At least one photo is required. The first image uploaded becomes the Hero image. Additional photos and documents are optional.</p>
        </div>
        <div
          className={`rounded-[2rem] border-2 border-dashed px-5 py-10 text-center transition ${dragActive ? "border-[var(--pier-orange)] bg-orange-50" : imageFiles.length === 0 ? "border-[color:rgba(217,119,6,0.5)] bg-[rgba(255,247,237,0.8)]" : "border-zinc-300 bg-zinc-50"}`}
          onDragOver={(event) => {
            event.preventDefault();
            setDragActive(true);
          }}
          onDragLeave={() => setDragActive(false)}
          onDrop={(event) => {
            event.preventDefault();
            setDragActive(false);
            addFiles(Array.from(event.dataTransfer.files ?? []));
          }}
        >
          <p className="text-sm font-semibold text-zinc-800">Drop listing photos or supporting PDFs here</p>
          <p className="mt-2 text-xs text-zinc-500">JPEG, PNG, WEBP, PDF</p>
          <button type="button" onClick={() => inputRef.current?.click()} className="mt-5 inline-flex items-center rounded-full bg-[var(--pier-orange)] px-5 py-3 text-sm font-semibold text-white transition hover:brightness-95">
            Choose files
          </button>
          <input ref={inputRef} type="file" className="hidden" multiple accept="image/*,.pdf,application/pdf" onChange={(event) => addFiles(Array.from(event.target.files ?? []))} />
        </div>
        {imageFiles.length === 0 ? <p className="mt-3 text-sm font-medium text-[var(--pier-orange)]">Upload at least one image to continue.</p> : null}
        <div className="mt-4 space-y-2">
          {files.length === 0 ? <p className="text-sm text-zinc-500">No files selected.</p> : null}
          {files.map((file) => {
            const isImage = file.type.startsWith("image/");
            const isHero = isImage && imageFiles[0] ? fileKey(imageFiles[0]) === fileKey(file) : false;
            return (
              <div key={fileKey(file)} className="rounded-[1.4rem] border border-zinc-200 bg-white px-4 py-3 text-sm shadow-sm">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="font-medium text-zinc-900">{file.name}</p>
                    <p className="text-xs text-zinc-500">{Math.max(1, Math.round(file.size / 1024))} KB</p>
                  </div>
                  <button type="button" onClick={() => removeFile(file)} className="text-sm font-semibold text-zinc-500 transition hover:text-red-600">
                    Remove
                  </button>
                </div>
                {isImage ? (
                  <div className="mt-3 flex items-center gap-3 text-xs">
                    <span className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 font-semibold ${isHero ? "border-orange-200 bg-orange-50 text-[var(--pier-orange)]" : "border-zinc-300 bg-zinc-50 text-zinc-700"}`}>
                      <span>{isHero ? "Hero image" : "Additional photo"}</span>
                    </span>
                  </div>
                ) : (
                  <p className="mt-3 text-xs text-zinc-500">Supporting document</p>
                )}
              </div>
            );
          })}
        </div>
      </section>

      {duplicateMatch ? (
        <section className="rounded-[2rem] border border-amber-300 bg-amber-50 p-5 text-sm text-amber-900 shadow-sm">
          <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-amber-700">Possible duplicate detected</p>
          <p className="mt-2 text-base font-semibold text-amber-950">This intake matches an existing draft or archived listing.</p>
          <div className="mt-3 space-y-1 text-amber-800">
            <p>Address: {duplicateMatch.address || "—"}</p>
            <p>Parcel: {duplicateMatch.parcelId || "—"}</p>
            <p>Status: {duplicateMatch.archived ? "Archived" : (duplicateMatch.workflowStatus || duplicateMatch.status || "Active")}</p>
            <p>Matched on: {duplicateMatch.matchedOn.join(", ")}</p>
          </div>
          <div className="mt-4 grid gap-2 sm:grid-cols-3">
            <button type="button" onClick={() => submitIntake("restore_existing")} className="inline-flex items-center justify-center rounded-full bg-emerald-600 px-4 py-3 font-semibold text-white transition hover:bg-emerald-700">
              {duplicateMatch.archived ? "Restore existing listing" : "Use existing listing"}
            </button>
            <button type="button" onClick={() => submitIntake("create_duplicate")} className="inline-flex items-center justify-center rounded-full border border-amber-700 bg-white px-4 py-3 font-semibold text-amber-800 transition hover:bg-amber-100">
              Create duplicate anyway
            </button>
            <button type="button" onClick={() => setDuplicateMatch(null)} className="inline-flex items-center justify-center rounded-full border border-zinc-300 bg-white px-4 py-3 font-semibold text-zinc-800 transition hover:bg-zinc-100">
              Dismiss warning
            </button>
          </div>
        </section>
      ) : null}

      {status === "success" && reviewChecklist ? (
        <section className={`rounded-[2rem] border p-5 shadow-sm ${reviewChecklist.checklistState === "blocked" ? "border-rose-200 bg-rose-50" : reviewChecklist.checklistState === "needs_manual_followup" ? "border-amber-200 bg-amber-50" : "border-emerald-200 bg-emerald-50"}`}>
          <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-zinc-500">Research-needed summary</p>
          <p className="mt-2 text-sm font-semibold text-zinc-950">{reviewChecklist.exceptionReason ?? "Draft enrichment looks healthy after intake."}</p>
          <div className="mt-3 grid gap-3 text-sm text-zinc-700 sm:grid-cols-2">
            <div>
              <p className="font-medium text-zinc-900">Auto-filled</p>
              <ul className="mt-1 list-disc pl-5">
                {(reviewChecklist.autoFilledFields.length ? reviewChecklist.autoFilledFields : ["None yet"]).map((item) => <li key={`auto-${item}`}>{item}</li>)}
              </ul>
            </div>
            <div>
              <p className="font-medium text-zinc-900">Needs follow-up</p>
              <ul className="mt-1 list-disc pl-5">
                {(reviewChecklist.manualResearchNeeded.length ? reviewChecklist.manualResearchNeeded : ["None"]).map((item) => <li key={`manual-${item}`}>{item}</li>)}
              </ul>
            </div>
          </div>
        </section>
      ) : null}

      <section className="sticky bottom-3 z-10 rounded-[2rem] border border-zinc-950 bg-[linear-gradient(135deg,#111827,#1f2937)] p-5 text-white shadow-[0_18px_60px_rgba(15,23,42,0.24)]">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="max-w-3xl">
            <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-zinc-400">Submit</p>
            <p className="mt-2 text-sm leading-7 text-zinc-200">
              {status === "idle" && "Creates the draft listing, uploads files, and starts enrichment + copy generation."}
              {status === "saving" && "Creating intake draft now…"}
              {status === "success" && `Draft created${createdSlug ? `: ${createdSlug}` : ""}. You can run another intake now while enrichment continues.`}
              {status === "error" && (errorMessage ?? "Failed to create intake draft.")}
            </p>
          </div>
          <button type="submit" disabled={status === "saving" || imageFiles.length === 0} className="inline-flex items-center justify-center rounded-full bg-white px-6 py-3 text-sm font-semibold text-zinc-950 transition enabled:hover:bg-orange-50 disabled:cursor-not-allowed disabled:opacity-60">
            Submit new listing
          </button>
        </div>
      </section>
    </form>
  );
}
