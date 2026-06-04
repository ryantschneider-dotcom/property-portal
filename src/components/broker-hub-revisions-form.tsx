"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type InterpreterResult = {
  summary: string[];
  flags: string[];
  confidence: "high" | "medium" | "low";
};

type ListingOption = {
  id: string;
  slug: string;
  title: string;
  address: string | null;
  transactionLabel: string | null;
  ownerEmail: string | null;
  reviewState: "ready" | "needs_manual_followup" | "blocked";
  missingFieldCount: number;
  blockedIssueCount: number;
  buildoutReady: boolean;
  enrichmentStatus: string | null;
  revisionWorkflow?: {
    currentRequest: {
      id: string | null;
      status: string | null;
      summary: string | null;
      createdAt: string | null;
      categories: Array<{
        code: string;
        title: string;
        severity: "warning" | "blocker";
        items: string[];
      }>;
    } | null;
    historyCount: number;
  };
};

function inputClassName() {
  return "w-full rounded-[1.2rem] border border-zinc-200 bg-white px-4 py-3.5 text-sm text-zinc-950 shadow-[0_12px_30px_rgba(17,24,39,0.06)] outline-none transition placeholder:text-zinc-400 focus:border-[var(--pier-orange)] focus:ring-4 focus:ring-[color:rgba(217,119,6,0.14)]";
}

function severityBadge(severity: "warning" | "blocker") {
  return severity === "blocker"
    ? "bg-rose-50 text-rose-700 border border-rose-200"
    : "bg-amber-50 text-amber-700 border border-amber-200";
}

export function BrokerHubRevisionsForm() {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [listings, setListings] = useState<ListingOption[]>([]);
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState("");
  const [instructions, setInstructions] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [dragActive, setDragActive] = useState(false);
  const [status, setStatus] = useState<"idle" | "saving" | "error" | "done">("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [interpreterResult, setInterpreterResult] = useState<InterpreterResult | null>(null);

  async function loadListings(preferredId?: string) {
    const response = await fetch("/api/broker/active-listings", { cache: "no-store" });
    const payload = await response.json();
    const nextListings = payload.items ?? [];
    setListings(nextListings);
    if (preferredId) {
      setSelectedId(preferredId);
    } else if (!selectedId && nextListings.find((item: ListingOption) => item.revisionWorkflow?.currentRequest)) {
      setSelectedId(nextListings.find((item: ListingOption) => item.revisionWorkflow?.currentRequest)?.id ?? "");
    }
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect, react-hooks/exhaustive-deps
    void loadListings();
  }, []);

  const filteredListings = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const prioritized = [...listings].sort((a, b) => Number(Boolean(b.revisionWorkflow?.currentRequest)) - Number(Boolean(a.revisionWorkflow?.currentRequest)));
    if (!needle) return prioritized;
    return prioritized.filter((item) => `${item.title} ${item.address ?? ""} ${item.slug}`.toLowerCase().includes(needle));
  }, [listings, query]);

  const selectedListing = listings.find((item) => item.id === selectedId) ?? null;
  const currentRequest = selectedListing?.revisionWorkflow?.currentRequest ?? null;
  const blockerCategories = currentRequest?.categories.filter((category) => category.severity === "blocker") ?? [];
  const warningCategories = currentRequest?.categories.filter((category) => category.severity === "warning") ?? [];

  function addFiles(nextFiles: File[]) {
    setFiles((current) => {
      const existing = new Set(current.map((file) => `${file.name}-${file.size}-${file.lastModified}`));
      return [...current, ...nextFiles.filter((file) => !existing.has(`${file.name}-${file.size}-${file.lastModified}`))];
    });
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus("saving");
    setErrorMessage(null);
    setInterpreterResult(null);

    try {
      const body = new FormData();
      body.set("propertyId", selectedId);
      body.set("instructions", instructions);
      files.forEach((file) => body.append("assets", file));

      const response = await fetch("/api/broker/revisions", { method: "POST", body });
      const payload = await response.json();
      if (!response.ok) {
        setStatus("error");
        setErrorMessage(payload.error ?? "Failed to save edit request.");
        return;
      }

      setStatus("done");
      setInterpreterResult(payload.interpreter ?? null);
      setInstructions("");
      setFiles([]);
      await loadListings(selectedId);
    } catch (error) {
      console.error(error);
      setStatus("error");
      setErrorMessage("Failed to save edit request.");
    }
  }

  return (
    <form onSubmit={handleSubmit} className="mx-auto max-w-[680px] space-y-3 rounded-[1.35rem] bg-white/85 p-3 shadow-[0_18px_60px_rgba(15,23,42,0.10)] ring-1 ring-zinc-200/70">
      <section className="overflow-hidden rounded-[1.25rem] border border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(203,82,30,0.22),transparent_34%),linear-gradient(135deg,#111827_0%,#172033_58%,#263245_100%)] p-5 text-white shadow-[0_22px_70px_rgba(15,23,42,0.24)] sm:p-6">
        <div className="grid gap-5 lg:grid-cols-[1.15fr_0.85fr] lg:items-center">
          <div>
            <p className="text-[9px] font-bold uppercase tracking-[0.24em] text-zinc-400">Existing Listing Modification</p>
            <h2 className="mt-2 max-w-[420px] text-[1.7rem] font-extrabold leading-[0.96] tracking-[-0.045em] text-white sm:text-[2rem]">AI Delta revisions for active listings.</h2>
            <p className="mt-3 max-w-[430px] text-[12px] font-medium leading-5 text-zinc-300 sm:text-[13px]">
              Select an active listing, describe the change in plain English, and The PIER Big Brain will package the broker delta into the revision workflow.
            </p>
          </div>
          <div className="rounded-[1rem] border border-white/10 bg-white/[0.12] p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)] backdrop-blur">
            <p className="text-[9px] font-bold uppercase tracking-[0.22em] text-zinc-400">How AI Delta handles it</p>
            <ul className="mt-3 space-y-2 text-[11px] font-semibold leading-5 text-zinc-200">
              <li>• Interprets your edit request in plain English</li>
              <li>• Auto-applies safe structured mutations when confidence is high enough</li>
              <li>• Packages the update with listing context and new files</li>
              <li>• Pushes the draft back into the right review workflow</li>
            </ul>
          </div>
        </div>
      </section>

      <section className="rounded-[2rem] border border-white/70 bg-white/94 p-5 shadow-[0_20px_60px_rgba(15,23,42,0.08)] sm:p-6">
        <div className="grid gap-5 lg:grid-cols-[1.15fr_0.85fr]">
          <div className="space-y-3">
            <label className="block space-y-2">
              <span className="text-sm font-semibold text-zinc-800">Find a listing</span>
              <input className={inputClassName()} value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search by title, address, or slug" />
            </label>
            <label className="block space-y-2">
              <span className="text-sm font-semibold text-zinc-800">Select active property-portal listing</span>
              <select className={inputClassName()} value={selectedId} onChange={(event) => setSelectedId(event.target.value)} required>
                <option value="">Select active property-portal listing</option>
                {filteredListings.map((listing) => (
                  <option key={listing.id} value={listing.id}>
                    {listing.title || listing.address || listing.slug}{listing.transactionLabel ? ` — ${listing.transactionLabel}` : ""}
                  </option>
                ))}
              </select>
            </label>
            <div className="max-h-[28rem] overflow-y-auto rounded-[1.75rem] border border-zinc-200 bg-zinc-50 p-2">
              {filteredListings.map((listing) => {
                const active = listing.id === selectedId;
                const hasOpenRequest = Boolean(listing.revisionWorkflow?.currentRequest);
                return (
                  <button
                    key={listing.id}
                    type="button"
                    onClick={() => setSelectedId(listing.id)}
                    className={`mb-2 flex w-full flex-col rounded-[1.35rem] border px-4 py-3.5 text-left transition last:mb-0 ${active ? "border-[var(--pier-orange)] bg-[linear-gradient(135deg,#fff7ed,#ffffff)] text-zinc-950 shadow-sm" : "border-transparent bg-white text-zinc-900 hover:border-zinc-200 hover:bg-zinc-100"}`}
                  >
                    <span className="flex flex-wrap items-center gap-2 text-sm font-semibold">
                      <span>{listing.title}</span>
                      {hasOpenRequest ? <span className="rounded-full bg-amber-100 px-2.5 py-1 text-[11px] font-semibold text-amber-700">Open review thread</span> : null}
                    </span>
                    <span className="mt-1 text-xs text-zinc-500">{listing.address || listing.slug}</span>
                  </button>
                );
              })}
              {filteredListings.length === 0 ? <p className="px-3 py-4 text-sm text-zinc-500">No active listings matched that search.</p> : null}
            </div>
          </div>

          <div className="rounded-[1.75rem] border border-zinc-200 bg-[linear-gradient(180deg,#ffffff,#f8fafc)] p-5">
            <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-zinc-500">Selected listing</p>
            {selectedListing ? (
              <div className="mt-3 space-y-4 text-sm text-zinc-700">
                <div>
                  <p className="text-xl font-semibold text-zinc-950">{selectedListing.title}</p>
                  <p className="mt-1">{selectedListing.address || "No address on file"}</p>
                  <p className="text-zinc-500">{selectedListing.transactionLabel || "No transaction label"}</p>
                </div>
                <div className="flex flex-wrap gap-2 text-xs font-semibold">
                  <span className={`rounded-full px-2.5 py-1 ${selectedListing.reviewState === "blocked" ? "bg-rose-50 text-rose-700" : selectedListing.reviewState === "needs_manual_followup" ? "bg-amber-50 text-amber-700" : "bg-emerald-50 text-emerald-700"}`}>
                    {selectedListing.reviewState === "blocked" ? "Blocked scrape" : selectedListing.reviewState === "needs_manual_followup" ? "Needs manual follow-up" : "Review layer healthy"}
                  </span>
                  <span className="rounded-full bg-zinc-100 px-2.5 py-1 text-zinc-700">Missing fields: {selectedListing.missingFieldCount}</span>
                  <span className="rounded-full bg-zinc-100 px-2.5 py-1 text-zinc-700">Blocked issues: {selectedListing.blockedIssueCount}</span>
                  <span className={`rounded-full px-2.5 py-1 ${selectedListing.buildoutReady ? "bg-emerald-50 text-emerald-700" : "bg-zinc-100 text-zinc-700"}`}>
                    Buildout {selectedListing.buildoutReady ? "ready" : "pending"}
                  </span>
                </div>
                {currentRequest ? (
                  <div className="rounded-[1.3rem] border border-zinc-200 bg-white p-4 text-xs text-zinc-700">
                    <p className="font-semibold uppercase tracking-[0.18em] text-zinc-500">Current revision request</p>
                    <p className="mt-2 text-sm font-semibold text-zinc-900">{currentRequest.summary || "Admin requested revisions before approval."}</p>
                    <p className="mt-2">Status: <span className="font-semibold">{currentRequest.status || "open"}</span></p>
                    {currentRequest.createdAt ? <p className="mt-1">Requested: {currentRequest.createdAt}</p> : null}
                  </div>
                ) : (
                  <p className="rounded-[1.3rem] border border-dashed border-zinc-300 bg-white p-4 text-xs text-zinc-600">No active admin send-back on this listing right now. You can still submit an enrich/edit request.</p>
                )}
              </div>
            ) : (
              <p className="mt-3 text-sm text-zinc-500">Choose a listing from the search results.</p>
            )}
          </div>
        </div>
      </section>

      {currentRequest ? (
        <section className="space-y-5 rounded-[2rem] border border-white/70 bg-white/94 p-5 shadow-[0_20px_60px_rgba(15,23,42,0.08)] sm:p-6">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-zinc-500">Admin send-back package</p>
            <h3 className="mt-2 text-xl font-semibold tracking-tight text-zinc-950">Fix blockers first, then clear warnings</h3>
            <p className="mt-1 text-sm text-zinc-500">If this listing has an active admin revision package, those items still take priority.</p>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <div className="rounded-[1.5rem] border border-rose-200 bg-rose-50 p-4">
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-semibold text-rose-900">Blockers</p>
                <span className="rounded-full bg-rose-100 px-2.5 py-1 text-xs font-semibold text-rose-700">Must fix</span>
              </div>
              <div className="mt-3 space-y-3">
                {blockerCategories.length ? blockerCategories.map((category) => (
                  <div key={`blocker-${category.code}`} className="rounded-[1.2rem] border border-white/70 bg-white/70 p-3">
                    <div className="flex items-center justify-between gap-2">
                      <p className="font-semibold text-zinc-900">{category.title}</p>
                      <span className={`rounded-full px-2 py-1 text-[11px] font-semibold uppercase ${severityBadge(category.severity)}`}>{category.severity}</span>
                    </div>
                    <ul className="mt-2 list-disc space-y-1 pl-5 text-zinc-700">
                      {category.items.map((item) => <li key={`${category.code}-${item}`}>{item}</li>)}
                    </ul>
                  </div>
                )) : <p className="text-sm text-rose-800">No blocker items listed.</p>}
              </div>
            </div>

            <div className="rounded-[1.5rem] border border-amber-200 bg-amber-50 p-4">
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-semibold text-amber-900">Warnings</p>
                <span className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-700">Should fix</span>
              </div>
              <div className="mt-3 space-y-3">
                {warningCategories.length ? warningCategories.map((category) => (
                  <div key={`warning-${category.code}`} className="rounded-[1.2rem] border border-white/70 bg-white/70 p-3">
                    <div className="flex items-center justify-between gap-2">
                      <p className="font-semibold text-zinc-900">{category.title}</p>
                      <span className={`rounded-full px-2 py-1 text-[11px] font-semibold uppercase ${severityBadge(category.severity)}`}>{category.severity}</span>
                    </div>
                    <ul className="mt-2 list-disc space-y-1 pl-5 text-zinc-700">
                      {category.items.map((item) => <li key={`${category.code}-${item}`}>{item}</li>)}
                    </ul>
                  </div>
                )) : <p className="text-sm text-amber-800">No warning items listed.</p>}
              </div>
            </div>
          </div>
        </section>
      ) : null}

      <section className="rounded-[2rem] border border-white/70 bg-white/94 p-5 shadow-[0_20px_60px_rgba(15,23,42,0.08)] sm:p-6">
        <div className="mb-4">
          <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-zinc-500">Natural-language edit request</p>
          <h3 className="mt-2 text-xl font-semibold tracking-tight text-zinc-950">Tell The PIER Big Brain what changed in the listing in your own words.</h3>
          <p className="mt-1 text-sm text-zinc-500">Examples: “Reduce sale price to $3.95M, update title, and note signalized corner exposure.” “Suite 200 is leased — remove it and adjust available square footage.”</p>
        </div>
        <textarea className={`${inputClassName()} min-h-44`} value={instructions} onChange={(event) => setInstructions(event.target.value)} placeholder="Describe the listing update in plain English..." required />
      </section>

      {status === "done" && interpreterResult ? (
        <section className={`rounded-[2rem] border p-5 shadow-[0_20px_60px_rgba(15,23,42,0.08)] sm:p-6 ${interpreterResult.summary.length ? "border-emerald-200 bg-emerald-50" : "border-amber-200 bg-amber-50"}`}>
          <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-zinc-500">Interpreter pass</p>
          <p className="mt-2 text-sm font-semibold text-zinc-950">
            {interpreterResult.summary.length
              ? `The PIER Big Brain auto-applied ${interpreterResult.summary.length} update${interpreterResult.summary.length === 1 ? "" : "s"} before routing to review.`
              : "The PIER Big Brain captured the request but did not auto-apply a safe structured mutation yet."}
          </p>
          <p className="mt-1 text-xs uppercase tracking-[0.18em] text-zinc-500">Confidence: {interpreterResult.confidence}</p>
          {interpreterResult.summary.length ? (
            <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-zinc-700">
              {interpreterResult.summary.map((item) => <li key={item}>{item}</li>)}
            </ul>
          ) : null}
          {interpreterResult.flags.length ? (
            <div className="mt-3">
              <p className="text-sm font-semibold text-zinc-900">Needs manual confirmation</p>
              <ul className="mt-1 list-disc space-y-1 pl-5 text-sm text-zinc-700">
                {interpreterResult.flags.map((item) => <li key={item}>{item}</li>)}
              </ul>
            </div>
          ) : null}
        </section>
      ) : null}

      <section className="rounded-[2rem] border border-white/70 bg-white/94 p-5 shadow-[0_20px_60px_rgba(15,23,42,0.08)] sm:p-6">
        <div className="flex flex-col gap-2">
          <h3 className="text-lg font-semibold tracking-tight text-zinc-950">Optional supporting files</h3>
          <p className="text-sm text-zinc-500">Upload fresh photos, rent rolls, surveys, OM pages, or any proof The PIER Big Brain should consider with the request.</p>
        </div>
        <div
          className={`mt-4 rounded-[2rem] border-2 border-dashed px-5 py-10 text-center transition ${dragActive ? "border-[var(--pier-orange)] bg-orange-50" : "border-zinc-300 bg-zinc-50"}`}
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
          <p className="text-sm font-medium text-zinc-700">Drop photos or PDFs here</p>
          <button type="button" onClick={() => inputRef.current?.click()} className="mt-5 inline-flex items-center rounded-full bg-[var(--pier-orange)] px-5 py-3 text-sm font-semibold text-white transition hover:brightness-95">
            Choose files
          </button>
          <input ref={inputRef} type="file" className="hidden" multiple accept="image/*,.pdf,application/pdf" onChange={(event) => addFiles(Array.from(event.target.files ?? []))} />
        </div>
        <div className="mt-4 space-y-2">
          {files.map((file) => (
            <div key={`${file.name}-${file.lastModified}`} className="flex items-center justify-between rounded-[1.3rem] border border-zinc-200 bg-white px-4 py-3 text-sm shadow-sm">
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

      <section className="rounded-[2rem] border border-zinc-950 bg-[linear-gradient(135deg,#111827,#1f2937)] p-5 text-white shadow-[0_18px_60px_rgba(15,23,42,0.24)] sm:p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="max-w-2xl text-sm leading-7 text-zinc-200">
            {status === "idle" && "Submit this request and The PIER Big Brain will package the change intent, attached evidence, and listing context into the edit workflow."}
            {status === "saving" && "Submitting edit request…"}
            {status === "error" && (errorMessage ?? "Failed to save edit request.")}
            {status === "done" && "Edit request submitted. The listing has been pushed back into the workflow with your instructions attached."}
          </p>
          <button type="submit" disabled={!selectedId || status === "saving" || !instructions.trim()} className="inline-flex items-center justify-center rounded-full bg-white px-6 py-3 text-sm font-semibold text-zinc-950 transition enabled:hover:bg-orange-50 disabled:cursor-not-allowed disabled:opacity-60">
            Submit edit request
          </button>
        </div>
      </section>
    </form>
  );
}
