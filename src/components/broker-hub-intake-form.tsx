"use client";

import { useEffect, useMemo, useRef, useState } from "react";
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
};

function inputClassName(required = false, invalid = false) {
  return `w-full rounded-xl border bg-white px-3 py-3 text-sm text-zinc-950 outline-none transition placeholder:text-zinc-400 focus:border-zinc-950 focus:ring-2 focus:ring-zinc-950/10 ${invalid ? "border-red-400 bg-red-50" : required ? "border-zinc-400" : "border-zinc-300"}`;
}

function sectionCardClassName() {
  return "rounded-xl border border-zinc-300 bg-zinc-50 p-4 sm:p-5";
}

function createSuite(): SuiteRow {
  return { id: Math.random().toString(36).slice(2), suiteNumber: "", availableSqFt: "", baseRent: "", rentType: "", unpriced: false };
}

function RequiredLabel({ children, required = true }: { children: React.ReactNode; required?: boolean }) {
  return <span className="text-sm font-medium text-zinc-700">{children}{required ? <span className="text-red-600"> *</span> : null}</span>;
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

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus("saving");
    setErrorMessage(null);
    setCreatedSlug(null);
    setReviewChecklist(null);

    try {
      const body = new FormData();
      body.set(
        "payload",
        JSON.stringify({
          ...formData,
          slug: suggestedSlug,
          heroPhotoKey: imageFiles[0] ? fileKey(imageFiles[0]) : null,
          suites: suites.filter((suite) => suite.suiteNumber.trim() || suite.availableSqFt.trim() || suite.baseRent.trim()),
        }),
      );
      files.forEach((file) => body.append("assets", file));

      const response = await fetch("/api/broker/intake", { method: "POST", body });
      const payload = await response.json();
      if (!response.ok) {
        setStatus("error");
        setErrorMessage(payload.error ?? "Failed to create broker intake draft.");
        return;
      }

      setStatus("success");
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

  return (
    <form onSubmit={handleSubmit} className="mx-auto flex max-w-4xl flex-col gap-4">
      <section className="rounded-xl border border-zinc-900 bg-zinc-950 p-4 text-white">
        <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-zinc-400">Internal Intake</p>
        <h3 className="mt-2 text-xl font-semibold tracking-tight">Create new listing draft</h3>
        <p className="mt-2 text-sm text-zinc-300">Required before submit: {requiredSummary.join(", ")}.</p>
      </section>

      <section className={sectionCardClassName()}>
        <div className="mb-4 border-b border-zinc-200 pb-3">
          <h3 className="text-base font-semibold text-zinc-950">1. Property basics</h3>
          <p className="mt-1 text-sm text-zinc-500">Asterisks mark the minimum fields needed to create the draft. Parcel format can be entered naturally — backend normalization handles county-specific cleanup.</p>
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
              <span className="text-sm font-medium text-zinc-700">ZIP</span>
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
          {isLand ? (
            <label className="space-y-2">
              <span className="text-sm font-medium text-zinc-700">Gross acres</span>
              <input className={inputClassName()} value={formData.grossAcres} onChange={(event) => update("grossAcres", event.target.value)} inputMode="decimal" />
            </label>
          ) : null}
          <label className="space-y-2">
            <span className="text-sm font-medium text-zinc-700">Draft slug</span>
            <input className={`${inputClassName()} bg-zinc-100`} value={suggestedSlug} readOnly />
          </label>
        </div>
      </section>

      <section className={sectionCardClassName()}>
        <div className="mb-4 border-b border-zinc-200 pb-3">
          <h3 className="text-base font-semibold text-zinc-950">2. Pricing / deal structure</h3>
          <p className="mt-1 text-sm text-zinc-500">Show only the deal fields that matter for the chosen transaction type.</p>
        </div>
        {isSale ? (
          <div className="space-y-4">
            <label className="space-y-2">
              <RequiredLabel required={!formData.saleUnpriced}>Sale price</RequiredLabel>
              <input className={inputClassName(true, !formData.saleUnpriced && !formData.salePrice)} value={formData.salePrice} onChange={(event) => update("salePrice", event.target.value)} inputMode="decimal" disabled={formData.saleUnpriced} required={!formData.saleUnpriced} />
            </label>
            <label className="flex items-center gap-3 rounded-lg border border-zinc-200 bg-white px-4 py-3 text-sm text-zinc-800">
              <input type="checkbox" checked={formData.saleUnpriced} onChange={(event) => update("saleUnpriced", event.target.checked)} />
              <span>Unpriced / Inquire</span>
            </label>
          </div>
        ) : null}
        {isLease ? (
          <div className="space-y-3 rounded-xl border border-zinc-200 bg-white p-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h4 className="text-sm font-semibold text-zinc-900">Suites</h4>
                <p className="text-xs text-zinc-500">Each lease listing needs at least one complete suite row.</p>
              </div>
              <button type="button" onClick={() => setSuites((current) => [...current, createSuite()])} className="inline-flex items-center rounded-lg border border-zinc-300 px-3 py-2 text-sm font-semibold text-zinc-700 transition hover:border-zinc-900 hover:text-zinc-950">
                + Add another suite
              </button>
            </div>
            <div className="space-y-3">
              {suites.map((suite, index) => (
                <div key={suite.id} className="grid gap-3 rounded-lg border border-zinc-200 bg-zinc-50 p-3 md:grid-cols-2 xl:grid-cols-5">
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
                    <label className="flex items-center gap-2 rounded-lg border border-zinc-200 bg-white px-3 py-3 text-sm text-zinc-800">
                      <input type="checkbox" checked={suite.unpriced} onChange={(event) => updateSuite(suite.id, "unpriced", event.target.checked)} />
                      <span>Unpriced / Inquire</span>
                    </label>
                    <button type="button" onClick={() => removeSuite(suite.id)} className="inline-flex items-center justify-center rounded-lg border border-zinc-300 px-3 py-3 text-sm font-semibold text-zinc-700 transition hover:border-red-500 hover:text-red-600">
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
        <div className="mb-4 border-b border-zinc-200 pb-3">
          <h3 className="text-base font-semibold text-zinc-950">3. Internal notes</h3>
          <p className="mt-1 text-sm text-zinc-500">This is where the real context goes.</p>
        </div>
        <label className="block space-y-2">
          <span className="text-sm font-medium text-zinc-700">Broker notes / brain dump</span>
          <textarea className={`${inputClassName()} min-h-40`} value={formData.brokerNotes} onChange={(event) => update("brokerNotes", event.target.value)} placeholder="Ownership issues, timing, access, tenant status, pricing reality, missing facts." />
        </label>
      </section>

      <section className={sectionCardClassName()}>
        <div className="mb-4 border-b border-zinc-200 pb-3">
          <h3 className="text-base font-semibold text-zinc-950">4. Photos and files</h3>
          <p className="mt-1 text-sm text-zinc-500">Photos are strongly recommended but not required. The first image you upload will automatically be used as the HERO / Main Photo.</p>
        </div>
        <div
          className={`rounded-xl border-2 border-dashed px-4 py-8 text-center transition ${dragActive ? "border-zinc-950 bg-zinc-100" : "border-zinc-300 bg-white"}`}
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
          <p className="text-sm font-medium text-zinc-700">Drop files here</p>
          <p className="mt-1 text-xs text-zinc-500">JPEG, PNG, WEBP, PDF</p>
          <button type="button" onClick={() => inputRef.current?.click()} className="mt-4 inline-flex items-center rounded-lg bg-zinc-950 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-zinc-800">
            Choose files
          </button>
          <input ref={inputRef} type="file" className="hidden" multiple accept="image/*,.pdf,application/pdf" onChange={(event) => addFiles(Array.from(event.target.files ?? []))} />
        </div>
        <div className="mt-4 space-y-2">
          {files.length === 0 ? <p className="text-sm text-zinc-500">No files selected.</p> : null}
          {files.map((file) => {
            const isImage = file.type.startsWith("image/");
            const isHero = isImage && imageFiles[0] ? fileKey(imageFiles[0]) === fileKey(file) : false;
            return (
              <div key={fileKey(file)} className="rounded-lg border border-zinc-200 bg-white px-4 py-3 text-sm">
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
                    <span className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 font-semibold ${isHero ? "border-emerald-300 bg-emerald-50 text-emerald-700" : "border-zinc-300 bg-zinc-50 text-zinc-700"}`}>
                      <span>{isHero ? "HERO / Main Photo" : "Additional Photo"}</span>
                    </span>
                    {!isHero ? <span className="text-zinc-500">Additional Photo</span> : null}
                  </div>
                ) : (
                  <p className="mt-3 text-xs text-zinc-500">Supporting document</p>
                )}
              </div>
            );
          })}
        </div>
      </section>

      {status === "success" && reviewChecklist ? (
        <section className={`rounded-xl border p-4 ${reviewChecklist.checklistState === "blocked" ? "border-rose-200 bg-rose-50" : reviewChecklist.checklistState === "needs_manual_followup" ? "border-amber-200 bg-amber-50" : "border-emerald-200 bg-emerald-50"}`}>
          <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-zinc-500">Research-needed summary</p>
          <p className="mt-2 text-sm font-semibold text-zinc-950">{reviewChecklist.exceptionReason ?? "Draft enrichment looks healthy after intake."}</p>
          <div className="mt-3 grid gap-3 sm:grid-cols-2 text-sm text-zinc-700">
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

      <section className="sticky bottom-3 z-10 rounded-xl border border-zinc-900 bg-zinc-950 p-4 text-white shadow-lg">
        <div className="flex flex-col gap-4">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-zinc-400">Submit</p>
            <p className="mt-2 text-sm text-zinc-200">
              {status === "idle" && "Creates the draft listing, uploads files, and starts enrichment + copy generation."}
              {status === "saving" && "Creating intake draft now…"}
              {status === "success" && `Draft created${createdSlug ? `: ${createdSlug}` : ""}. You can run another intake now while enrichment continues.`}
              {status === "error" && (errorMessage ?? "Failed to create intake draft.")}
            </p>
          </div>
          <button type="submit" className="inline-flex items-center justify-center rounded-lg bg-white px-5 py-3 text-sm font-semibold text-zinc-950 transition hover:bg-zinc-200">
            Submit new listing
          </button>
        </div>
      </section>
    </form>
  );
}
