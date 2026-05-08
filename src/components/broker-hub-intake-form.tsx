"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import {
  BROKER_HUB_BROKERS,
  BROKER_HUB_COUNTIES,
  BROKER_HUB_LEASE_TYPES,
  BROKER_HUB_PROPERTY_TYPES,
  buildListingSlug,
} from "@/lib/broker-hub-shared";

type SuiteRow = {
  id: string;
  suiteNumber: string;
  availableSqFt: string;
};

type IntakeState = {
  addressStreet: string;
  city: string;
  state: string;
  zip: string;
  county: string;
  parcelId: string;
  propertyType: string;
  transactionType: "Sale" | "Lease" | "Both";
  salePrice: string;
  grossAcres: string;
  leaseRate: string;
  leaseType: string;
  brokerNotes: string;
  leadBrokers: string[];
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
  grossAcres: "",
  leaseRate: "",
  leaseType: "",
  brokerNotes: "",
  leadBrokers: [],
};

function inputClassName() {
  return "w-full rounded-xl border border-zinc-300 bg-white px-3 py-3 text-sm text-zinc-950 outline-none transition placeholder:text-zinc-400 focus:border-zinc-950 focus:ring-2 focus:ring-zinc-950/10";
}

function sectionCardClassName() {
  return "rounded-xl border border-zinc-300 bg-zinc-50 p-4 sm:p-5";
}

function createSuite(): SuiteRow {
  return { id: Math.random().toString(36).slice(2), suiteNumber: "", availableSqFt: "" };
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

  const isSale = formData.transactionType === "Sale" || formData.transactionType === "Both";
  const isLease = formData.transactionType === "Lease" || formData.transactionType === "Both";
  const isLand = formData.propertyType === "Land";
  const suggestedSlug = useMemo(() => buildListingSlug(formData.addressStreet, formData.city, formData.propertyType), [formData.addressStreet, formData.city, formData.propertyType]);

  function update<K extends keyof IntakeState>(key: K, value: IntakeState[K]) {
    setFormData((current) => ({ ...current, [key]: value }));
  }

  function toggleLeadBroker(name: string) {
    setFormData((current) => ({
      ...current,
      leadBrokers: current.leadBrokers.includes(name)
        ? current.leadBrokers.filter((broker) => broker !== name)
        : [...current.leadBrokers, name],
    }));
  }

  function addFiles(nextFiles: File[]) {
    setFiles((current) => {
      const existing = new Set(current.map((file) => `${file.name}-${file.size}-${file.lastModified}`));
      return [...current, ...nextFiles.filter((file) => !existing.has(`${file.name}-${file.size}-${file.lastModified}`))];
    });
  }

  function updateSuite(id: string, key: keyof Omit<SuiteRow, "id">, value: string) {
    setSuites((current) => current.map((suite) => (suite.id === id ? { ...suite, [key]: value } : suite)));
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
          suites: suites.filter((suite) => suite.suiteNumber.trim() || suite.availableSqFt.trim()),
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
    <form onSubmit={handleSubmit} className="mx-auto flex max-w-3xl flex-col gap-4">
      <section className="rounded-xl border border-zinc-900 bg-zinc-950 p-4 text-white">
        <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-zinc-400">Internal Intake</p>
        <h3 className="mt-2 text-xl font-semibold tracking-tight">Create new listing draft</h3>
        <p className="mt-2 text-sm text-zinc-300">Enter the core facts first. After submit, the system will create the draft, normalize parcel data, and kick off enrichment.</p>
      </section>

      <section className={sectionCardClassName()}>
        <div className="mb-4 border-b border-zinc-200 pb-3">
          <h3 className="text-base font-semibold text-zinc-950">1. Property basics</h3>
          <p className="mt-1 text-sm text-zinc-500">Required fields only. Keep it fast and accurate.</p>
        </div>
        <div className="flex flex-col gap-4">
          <label className="space-y-2">
            <span className="text-sm font-medium text-zinc-700">Street address</span>
            <input className={inputClassName()} value={formData.addressStreet} onChange={(event) => update("addressStreet", event.target.value)} required />
          </label>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="space-y-2">
              <span className="text-sm font-medium text-zinc-700">City</span>
              <input className={inputClassName()} value={formData.city} onChange={(event) => update("city", event.target.value)} required />
            </label>
            <label className="space-y-2">
              <span className="text-sm font-medium text-zinc-700">State</span>
              <input className={inputClassName()} value={formData.state} onChange={(event) => update("state", event.target.value)} required />
            </label>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="space-y-2">
              <span className="text-sm font-medium text-zinc-700">ZIP</span>
              <input className={inputClassName()} value={formData.zip} onChange={(event) => update("zip", event.target.value)} inputMode="numeric" />
            </label>
            <label className="space-y-2">
              <span className="text-sm font-medium text-zinc-700">County</span>
              <select className={inputClassName()} value={formData.county} onChange={(event) => update("county", event.target.value)} required>
                <option value="">Select county</option>
                {BROKER_HUB_COUNTIES.map((county) => (
                  <option key={county} value={county}>{county}</option>
                ))}
              </select>
            </label>
          </div>
          <label className="space-y-2">
            <span className="text-sm font-medium text-zinc-700">Parcel ID</span>
            <input className={inputClassName()} value={formData.parcelId} onChange={(event) => update("parcelId", event.target.value)} required />
          </label>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="space-y-2">
              <span className="text-sm font-medium text-zinc-700">Property type</span>
              <select className={inputClassName()} value={formData.propertyType} onChange={(event) => update("propertyType", event.target.value)}>
                <option value="">Select type</option>
                {BROKER_HUB_PROPERTY_TYPES.map((propertyType) => (
                  <option key={propertyType} value={propertyType}>{propertyType}</option>
                ))}
              </select>
            </label>
            <label className="space-y-2">
              <span className="text-sm font-medium text-zinc-700">Transaction type</span>
              <select className={inputClassName()} value={formData.transactionType} onChange={(event) => update("transactionType", event.target.value as IntakeState["transactionType"])}>
                <option value="Sale">Sale</option>
                <option value="Lease">Lease</option>
                <option value="Both">Both</option>
              </select>
            </label>
          </div>
          <label className="space-y-2">
            <span className="text-sm font-medium text-zinc-700">Draft slug</span>
            <input className={`${inputClassName()} bg-zinc-100`} value={suggestedSlug} readOnly />
          </label>
        </div>
      </section>

      <section className={sectionCardClassName()}>
        <div className="mb-4 border-b border-zinc-200 pb-3">
          <h3 className="text-base font-semibold text-zinc-950">2. Deal terms</h3>
          <p className="mt-1 text-sm text-zinc-500">Only show the pricing fields that matter for this listing.</p>
        </div>
        <div className="flex flex-col gap-4">
          {isSale ? (
            <label className="space-y-2">
              <span className="text-sm font-medium text-zinc-700">Sale price</span>
              <input className={inputClassName()} value={formData.salePrice} onChange={(event) => update("salePrice", event.target.value)} inputMode="decimal" />
            </label>
          ) : null}
          {isLand ? (
            <label className="space-y-2">
              <span className="text-sm font-medium text-zinc-700">Gross acres</span>
              <input className={inputClassName()} value={formData.grossAcres} onChange={(event) => update("grossAcres", event.target.value)} inputMode="decimal" required={isLand} />
            </label>
          ) : null}
          {isLease ? (
            <>
              <label className="space-y-2">
                <span className="text-sm font-medium text-zinc-700">Lease rate ($/SF)</span>
                <input className={inputClassName()} value={formData.leaseRate} onChange={(event) => update("leaseRate", event.target.value)} inputMode="decimal" required={isLease} />
              </label>
              <label className="space-y-2">
                <span className="text-sm font-medium text-zinc-700">Lease type</span>
                <select className={inputClassName()} value={formData.leaseType} onChange={(event) => update("leaseType", event.target.value)} required={isLease}>
                  <option value="">Select lease type</option>
                  {BROKER_HUB_LEASE_TYPES.map((leaseType) => (
                    <option key={leaseType} value={leaseType}>{leaseType}</option>
                  ))}
                </select>
              </label>
              <div className="space-y-3 rounded-xl border border-zinc-200 bg-white p-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h4 className="text-sm font-semibold text-zinc-900">Available suites</h4>
                    <p className="text-xs text-zinc-500">One row per space.</p>
                  </div>
                  <button type="button" onClick={() => setSuites((current) => [...current, createSuite()])} className="inline-flex items-center rounded-lg border border-zinc-300 px-3 py-2 text-sm font-semibold text-zinc-700 transition hover:border-zinc-900 hover:text-zinc-950">
                    Add suite
                  </button>
                </div>
                <div className="space-y-3">
                  {suites.map((suite, index) => (
                    <div key={suite.id} className="grid gap-3 rounded-lg border border-zinc-200 bg-zinc-50 p-3 sm:grid-cols-[1fr_1fr_auto]">
                      <label className="space-y-2">
                        <span className="text-xs font-medium uppercase tracking-[0.18em] text-zinc-500">Suite {index + 1}</span>
                        <input className={inputClassName()} value={suite.suiteNumber} onChange={(event) => updateSuite(suite.id, "suiteNumber", event.target.value)} placeholder="Suite number" required={isLease && index === 0} />
                      </label>
                      <label className="space-y-2">
                        <span className="text-xs font-medium uppercase tracking-[0.18em] text-zinc-500">Available SF</span>
                        <input className={inputClassName()} value={suite.availableSqFt} onChange={(event) => updateSuite(suite.id, "availableSqFt", event.target.value)} placeholder="Square feet" inputMode="numeric" required={isLease && index === 0} />
                      </label>
                      <div className="flex items-end">
                        <button type="button" onClick={() => removeSuite(suite.id)} className="inline-flex w-full items-center justify-center rounded-lg border border-zinc-300 px-3 py-3 text-sm font-semibold text-zinc-700 transition hover:border-red-500 hover:text-red-600">
                          Remove
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </>
          ) : null}
        </div>
      </section>

      <section className={sectionCardClassName()}>
        <div className="mb-4 border-b border-zinc-200 pb-3">
          <h3 className="text-base font-semibold text-zinc-950">3. Internal notes</h3>
          <p className="mt-1 text-sm text-zinc-500">This is where the real context goes.</p>
        </div>
        <label className="block space-y-2">
          <span className="text-sm font-medium text-zinc-700">Broker notes / brain dump</span>
          <textarea className={`${inputClassName()} min-h-40`} value={formData.brokerNotes} onChange={(event) => update("brokerNotes", event.target.value)} placeholder="Ownership issues, timing, access, politics, tenant status, pricing reality, missing facts." />
        </label>
        <div className="mt-4 space-y-3">
          <span className="text-sm font-medium text-zinc-700">Lead broker (optional)</span>
          <div className="grid gap-2 sm:grid-cols-3">
            {BROKER_HUB_BROKERS.map((broker) => {
              const checked = formData.leadBrokers.includes(broker);
              return (
                <label key={broker} className={`flex cursor-pointer items-center gap-3 rounded-lg border px-4 py-3 text-sm font-medium transition ${checked ? "border-zinc-950 bg-zinc-950 text-white" : "border-zinc-300 bg-white text-zinc-800 hover:border-zinc-950"}`}>
                  <input type="checkbox" className="sr-only" checked={checked} onChange={() => toggleLeadBroker(broker)} />
                  <span>{broker}</span>
                </label>
              );
            })}
          </div>
        </div>
      </section>

      <section className={sectionCardClassName()}>
        <div className="mb-4 border-b border-zinc-200 pb-3">
          <h3 className="text-base font-semibold text-zinc-950">4. Photos and files</h3>
          <p className="mt-1 text-sm text-zinc-500">Attach source photos, flyers, OM pages, tax docs, or PDFs.</p>
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
          {files.map((file) => (
            <div key={`${file.name}-${file.lastModified}`} className="flex items-center justify-between rounded-lg border border-zinc-200 bg-white px-4 py-3 text-sm">
              <div>
                <p className="font-medium text-zinc-900">{file.name}</p>
                <p className="text-xs text-zinc-500">{Math.max(1, Math.round(file.size / 1024))} KB</p>
              </div>
              <button type="button" onClick={() => setFiles((current) => current.filter((entry) => entry !== file))} className="text-sm font-semibold text-zinc-500 transition hover:text-red-600">
                Remove
              </button>
            </div>
          ))}
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
