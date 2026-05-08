"use client";

import Image from "next/image";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import type { AdminPropertyFormData } from "@/lib/admin";
import type { PortalRole } from "@/lib/users";
import type { PropertyDetail } from "@/lib/types";

type AdminPropertyFormProps = {
  initialData: AdminPropertyFormData;
  mode: "edit" | "new";
  media?: PropertyDetail["media"];
  documentId?: string;
  userRole: PortalRole;
  workflow?: {
    status: string | null;
    workflowStatus: string | null;
    ownerEmail: string | null;
    leadBroker: string | null;
    createdVia: string | null;
    intakeStatus: string | null;
    uploadedPhotoCount: number;
    updatedAt: string | null;
    enrichmentStatus?: string | null;
    enrichmentSummary?: string | null;
    enrichmentLastRunAt?: string | null;
    missingFields?: string[];
    countyRoutingStatus?: string | null;
    countyRoutingSource?: string | null;
    countyRoutingNotes?: string | null;
    launchpadErrors?: string[];
    extractedFields?: {
      buildingSizeSf: boolean;
      lotSizeAcres: boolean;
      zoning: boolean;
      aiDraft: boolean;
    };
    researchSummary?: {
      publicRecordsStatus: string | null;
      placesStatus: string | null;
      parcelNumber: string | null;
      buildingSizeSf: string | null;
      lotSizeAcres: string | null;
      zoning: string | null;
      propertyClass: string | null;
      assessorImprovements: string[];
    };
    generatedCopy?: {
      saleTitle: string | null;
      saleDescription: string | null;
      locationDescription: string | null;
      exteriorDescription: string | null;
      saleBullets: string[];
      generator: string | null;
    };
    approvalStatus?: string | null;
    approvalSubmittedAt?: string | null;
    approvalSubmittedBy?: string | null;
    approvalDecidedAt?: string | null;
    approvalDecidedBy?: string | null;
    approvalDecisionNote?: string | null;
    approvalRejectionReason?: string | null;
    buildoutReady?: boolean;
    buildoutPayloadVersion?: string | null;
    buildoutSyncStatus?: string | null;
    buildoutSyncError?: string | null;
    buildoutMissingFields?: string[];
    buildoutWarnings?: string[];
    preflight?: {
      status: "blocked" | "publish_ready_with_warnings" | "publish_ready";
      blockers: string[];
      warnings: string[];
      sections: {
        identity: { status: "ok" | "warning" | "blocked"; blockers: string[]; warnings: string[] };
        pricing: { status: "ok" | "warning" | "blocked"; blockers: string[]; warnings: string[] };
        media: { status: "ok" | "warning" | "blocked"; blockers: string[]; warnings: string[] };
        copy: { status: "ok" | "warning" | "blocked"; blockers: string[]; warnings: string[] };
        buildout: { status: "ok" | "warning" | "blocked"; blockers: string[]; warnings: string[] };
      };
    };
    reviewChecklist?: {
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
  };
};

type MediaImage = PropertyDetail["media"]["images"][number];

type SaveState = "idle" | "saving" | "saved" | "error";

function normalizeSlug(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");
}

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

function checklistTone(state: "ready" | "needs_manual_followup" | "blocked" | undefined) {
  switch (state) {
    case "ready":
      return "border-emerald-200 bg-emerald-50 text-emerald-800";
    case "blocked":
      return "border-red-200 bg-red-50 text-red-800";
    default:
      return "border-amber-200 bg-amber-50 text-amber-800";
  }
}

function getMediaImageSrc(image: MediaImage | null | undefined) {
  return image?.urls?.large ?? image?.urls?.xlarge ?? image?.urls?.full ?? image?.urls?.original ?? null;
}

function preflightTone(state: "blocked" | "publish_ready_with_warnings" | "publish_ready" | undefined) {
  switch (state) {
    case "publish_ready":
      return "border-emerald-200 bg-emerald-50 text-emerald-800";
    case "blocked":
      return "border-red-200 bg-red-50 text-red-800";
    default:
      return "border-amber-200 bg-amber-50 text-amber-800";
  }
}

function Section({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-3xl border border-zinc-200 bg-white p-8 shadow-sm">
      <div className="mb-6">
        <h2 className="text-2xl font-semibold tracking-tight">{title}</h2>
        {description ? <p className="mt-2 text-sm text-zinc-500">{description}</p> : null}
      </div>
      {children}
    </section>
  );
}

export function AdminPropertyForm({ initialData, mode, media, documentId, workflow, userRole }: AdminPropertyFormProps) {
  const router = useRouter();
  const [formData, setFormData] = useState<AdminPropertyFormData>(initialData);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [mediaImages, setMediaImages] = useState<MediaImage[]>(media?.images ?? []);
  const [heroImageUrl, setHeroImageUrl] = useState<string | null>(media?.heroImageUrl ?? null);
  const [pendingPhotos, setPendingPhotos] = useState<File[]>([]);
  const [uploadState, setUploadState] = useState<"idle" | "uploading" | "done" | "error">("idle");
  const [uploadMessage, setUploadMessage] = useState<string | null>(null);
  const [enrichState, setEnrichState] = useState<"idle" | "running" | "done" | "error">("idle");
  const [enrichMessage, setEnrichMessage] = useState<string | null>(workflow?.enrichmentSummary ?? null);
  const [readyState, setReadyState] = useState<"idle" | "saving" | "done" | "error">("idle");
  const [readyMessage, setReadyMessage] = useState<string | null>(null);
  const [approvalState, setApprovalState] = useState<"idle" | "saving" | "done" | "error">("idle");
  const [approvalMessage, setApprovalMessage] = useState<string | null>(null);
  const [approvalNote, setApprovalNote] = useState<string>(workflow?.approvalDecisionNote ?? workflow?.approvalRejectionReason ?? "");
  const [exportState, setExportState] = useState<"idle" | "running" | "done" | "error">("idle");
  const [exportMessage, setExportMessage] = useState<string | null>(null);
  const [exportPreview, setExportPreview] = useState<Record<string, unknown> | null>(null);
  const [exportMissingFields, setExportMissingFields] = useState<string[]>(workflow?.buildoutMissingFields ?? []);
  const [exportWarnings, setExportWarnings] = useState<string[]>(workflow?.buildoutWarnings ?? []);

  const isAdmin = userRole === "admin";
  const hasEnrichmentErrors = Boolean(workflow?.launchpadErrors?.length);

  useEffect(() => {
    console.log("[enrich][client] admin form hydrated", {
      slug: initialData.slug,
      mode,
      documentId: documentId ?? null,
      mediaImageCount: mediaImages.length,
    });
  }, [documentId, initialData.slug, mediaImages.length, mode]);

  const currentHeroPreview = useMemo(() => {
    return (
      heroImageUrl ??
      getMediaImageSrc(mediaImages.find((image) => image?.isPrimary)) ??
      getMediaImageSrc(mediaImages.find((image) => Boolean(image?.urls?.large || image?.urls?.xlarge || image?.urls?.full || image?.urls?.original))) ??
      getMediaImageSrc(mediaImages[0]) ??
      null
    );
  }, [heroImageUrl, mediaImages]);

  function update<K extends keyof AdminPropertyFormData>(key: K, value: AdminPropertyFormData[K]) {
    setFormData((current) => ({ ...current, [key]: value }));
  }

  async function handlePhotoUpload() {
    if (!pendingPhotos.length || !documentId) return;

    setUploadState("uploading");
    setUploadMessage(null);

    try {
      const body = new FormData();
      body.set("slug", formData.slug);
      body.set("documentId", documentId);
      pendingPhotos.forEach((file) => body.append("photos", file));

      const response = await fetch("/api/admin/properties/media", {
        method: "POST",
        body,
      });

      const payload = await response.json();
      if (!response.ok) {
        setUploadState("error");
        setUploadMessage(payload.error ?? "Unable to upload photos");
        return;
      }

      setMediaImages(payload.images ?? []);
      setHeroImageUrl(payload.heroImageUrl ?? null);
      setPendingPhotos([]);
      setUploadState("done");
      setUploadMessage(`Uploaded ${payload.addedCount ?? pendingPhotos.length} photo(s).`);
      router.refresh();
    } catch (error) {
      console.error(error);
      setUploadState("error");
      setUploadMessage("Unable to upload photos");
    }
  }

  async function handleEnrichDraft() {
    console.log("[enrich][client] handleEnrichDraft clicked", {
      slug: formData.slug,
      documentId: documentId ?? null,
      currentPath: typeof window !== "undefined" ? window.location.pathname : null,
    });

    if (!formData.slug) {
      console.warn("[enrich][client] missing slug; aborting enrich click");
      return;
    }

    setEnrichState("running");
    setEnrichMessage("Starting draft enrichment…");

    try {
      console.log("[enrich][client] sending enrich request", { slug: formData.slug });
      const response = await fetch("/api/admin/properties/enrich", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug: formData.slug }),
      });

      console.log("[enrich][client] enrich response received", { slug: formData.slug, status: response.status, ok: response.ok });
      const payload = await response.json();
      if (!response.ok) {
        console.error("[enrich][client] enrich response error", payload);
        setEnrichState("error");
        setEnrichMessage(payload.error ?? "Unable to enrich draft");
        return;
      }

      if (payload.generated) {
        console.log("[enrich][client] applying generated enrichment payload", payload.generated);
        setFormData((current) => ({
          ...current,
          saleTitle: payload.generated.saleTitle || current.saleTitle,
          saleDescription: payload.generated.saleDescription || current.saleDescription,
          locationDescription: payload.generated.locationDescription || current.locationDescription,
          saleBullets: Array.isArray(payload.generated.saleBullets) ? payload.generated.saleBullets.join("\n") : current.saleBullets,
        }));
      }

      setEnrichState("done");
      setEnrichMessage(
        payload.missingFields?.length
          ? `Draft enrichment ran. Still missing: ${payload.missingFields.join(", ")}`
          : "Draft enrichment ran successfully.",
      );
      router.refresh();
    } catch (error) {
      console.error("[enrich][client] enrich request crashed before completion", error);
      setEnrichState("error");
      setEnrichMessage(error instanceof Error ? `Unable to enrich draft: ${error.message}` : "Unable to enrich draft");
    }
  }

  async function handleMarkReady() {
    if (!formData.slug) return;

    setReadyState("saving");
    setReadyMessage(null);

    try {
      const response = await fetch("/api/admin/properties/mark-ready", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug: formData.slug }),
      });
      const payload = await response.json();
      if (!response.ok) {
        setReadyState("error");
        setReadyMessage(payload.error ?? "Unable to mark draft ready");
        return;
      }
      setReadyState("done");
      setReadyMessage(
        payload.preflight?.warnings?.length
          ? `Draft marked ready for approval with warnings: ${payload.preflight.warnings.join(", ")}`
          : "Draft marked ready for approval.",
      );
      router.refresh();
    } catch (error) {
      console.error(error);
      setReadyState("error");
      setReadyMessage("Unable to mark draft ready");
    }
  }

  async function handleApproval(action: "approve" | "reject") {
    if (!formData.slug) return;

    setApprovalState("saving");
    setApprovalMessage(null);

    try {
      const response = await fetch(`/api/admin/properties/${action}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          slug: formData.slug,
          note: approvalNote,
          reason: action === "reject" ? approvalNote : undefined,
        }),
      });
      const payload = await response.json();
      if (!response.ok) {
        setApprovalState("error");
        setApprovalMessage(payload.error ?? `Unable to ${action} property`);
        return;
      }
      setApprovalState("done");
      setApprovalMessage(
        action === "approve"
          ? payload.preflight?.warnings?.length
            ? `Property approved with warnings: ${payload.preflight.warnings.join(", ")}`
            : "Property approved."
          : "Property sent back for changes.",
      );
      router.refresh();
    } catch (error) {
      console.error(error);
      setApprovalState("error");
      setApprovalMessage(`Unable to ${action} property`);
    }
  }

  async function handleBuildoutPreview() {
    if (!formData.slug) return;

    setExportState("running");
    setExportMessage(null);

    try {
      const response = await fetch("/api/admin/properties/export-buildout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug: formData.slug }),
      });
      const payload = await response.json();
      if (!response.ok) {
        setExportState("error");
        setExportMessage(payload.error ?? "Unable to generate Buildout payload preview");
        return;
      }
      setExportState("done");
      setExportMessage(payload.ready ? "Buildout payload preview is ready." : "Buildout preview generated with validation gaps.");
      setExportPreview(payload.payload ?? null);
      setExportMissingFields(Array.isArray(payload.missingRequiredFields) ? payload.missingRequiredFields : []);
      setExportWarnings(Array.isArray(payload.warnings) ? payload.warnings : []);
      router.refresh();
    } catch (error) {
      console.error(error);
      setExportState("error");
      setExportMessage("Unable to generate Buildout payload preview");
    }
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
    if (payload.sync?.success === false) {
      setErrorMessage(`Saved to Listing Stream, but Ascendix sync failed: ${payload.sync.message}`);
    } else if (payload.sync?.success) {
      setErrorMessage(
        `Saved and synced to Ascendix (${payload.sync.listingStatus ?? "listing"}${payload.sync.dealStage ? ` / ${payload.sync.dealStage}` : ""}).`,
      );
    } else if (payload.sync?.skipped) {
      setErrorMessage(`Saved to Listing Stream. Ascendix sync skipped: ${payload.sync.message}`);
    }
    router.push(`/admin/properties/${payload.slug}/edit?saved=1`);
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-8">
      <div className="grid gap-8 xl:grid-cols-[1.4fr_0.8fr]">
        <div className="space-y-8">
          <Section title="Core listing information" description="Main listing identity, routing, and broker-facing fields.">
            <div className="grid gap-5 md:grid-cols-2">
              <Field label="Slug">
                <input
                  className={inputClassName()}
                  value={formData.slug}
                  onChange={(e) => update("slug", normalizeSlug(e.target.value))}
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  required
                />
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
              <Field label="Listing Status">
                <select className={inputClassName()} value={formData.listingStatus} onChange={(e) => update("listingStatus", e.target.value as AdminPropertyFormData["listingStatus"])}>
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                  <option value="leased">Leased</option>
                  <option value="sold">Sold</option>
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
          </Section>

          <Section title="Address & coordinates" description="Canonical address, county, and map positioning.">
            <div className="grid gap-5 md:grid-cols-2">
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
          </Section>

          <Section title="Descriptions & bullets" description="Primary copy blocks used for listing output and Buildout-ready content.">
            <div className="space-y-5">
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
          </Section>

          <Section title="Location intelligence" description="Nearby anchors, restaurants, banks, and corridor context from enrichment.">
            <div className="space-y-5">
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
          </Section>

          <Section
            title="Photos & media"
            description="This is the missing return-later workflow layer: brokers/admins can review existing images and upload more photos after intake."
          >
            <div className="space-y-6">
              <div className="grid gap-6 lg:grid-cols-[1fr_1.2fr]">
                <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4">
                  <p className="text-sm font-medium text-zinc-700">Current hero image</p>
                  <div className="mt-3 relative aspect-[4/3] overflow-hidden rounded-2xl bg-zinc-100">
                    {currentHeroPreview ? (
                      <Image src={currentHeroPreview} alt={formData.title || "Hero image"} fill className="object-cover" sizes="(max-width: 1024px) 100vw, 40vw" />
                    ) : (
                      <div className="flex h-full items-center justify-center text-sm text-zinc-500">No hero image yet</div>
                    )}
                  </div>
                  <p className="mt-3 text-xs text-zinc-500">
                    Hero image currently follows the first uploaded image. Manual hero/reorder controls can be added in the next pass.
                  </p>
                </div>

                <div className="space-y-4">
                  <label className="block space-y-2">
                    <span className="text-sm font-medium text-zinc-700">Upload additional photos</span>
                    <input
                      className={inputClassName()}
                      type="file"
                      multiple
                      accept="image/*"
                      onChange={(e) => setPendingPhotos(Array.from(e.target.files ?? []))}
                    />
                  </label>
                  <div className="rounded-2xl border border-zinc-200 bg-white p-4 text-sm text-zinc-600">
                    <p>Selected: {pendingPhotos.length} file(s)</p>
                    <p className="mt-2">
                      Use this when a broker submits the draft quickly and comes back later with better or additional images.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={handlePhotoUpload}
                    disabled={!pendingPhotos.length || !documentId || uploadState === "uploading"}
                    className="inline-flex w-full items-center justify-center rounded-2xl border border-zinc-900 bg-white px-5 py-3 text-sm font-semibold text-zinc-900 transition hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {uploadState === "uploading" ? "Uploading photos…" : "Upload additional photos"}
                  </button>
                  {uploadMessage ? <p className={`text-sm ${uploadState === "error" ? "text-red-600" : "text-zinc-600"}`}>{uploadMessage}</p> : null}
                </div>
              </div>

              <div>
                <div className="mb-3 flex items-center justify-between">
                  <p className="text-sm font-medium text-zinc-700">Current gallery</p>
                  <p className="text-xs text-zinc-500">{mediaImages.length} image(s)</p>
                </div>
                {mediaImages.length ? (
                  <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                    {mediaImages.map((image, index) => {
                      const src = getMediaImageSrc(image);
                      return (
                        <div key={`${image.id ?? index}`} className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm">
                          <div className="relative aspect-[4/3] bg-zinc-100">
                            {src ? <Image src={src} alt={image.title ?? formData.title} fill className="object-cover" sizes="(max-width: 768px) 100vw, 33vw" /> : null}
                            {image.isPrimary ? (
                              <div className="absolute left-3 top-3 rounded-full bg-zinc-900 px-2 py-1 text-[11px] font-semibold text-white">Hero</div>
                            ) : null}
                          </div>
                          <div className="p-4">
                            <p className="text-sm font-medium text-zinc-900">{image.title ?? `Gallery Image ${index + 1}`}</p>
                            <p className="mt-1 text-xs text-zinc-500">Sort order: {image.sortOrder ?? index}</p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="rounded-2xl border border-dashed border-zinc-300 bg-zinc-50 p-6 text-sm text-zinc-500">
                    No gallery images yet. Brokers can upload at intake or return later from this draft editor.
                  </div>
                )}
              </div>
            </div>
          </Section>
        </div>

        <div className="space-y-8 xl:sticky xl:top-6 xl:self-start">
          <Section title="Pricing & facts" description="Operator-facing price controls, property facts, and Buildout classification IDs.">
            <div className="space-y-5">
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
          </Section>

          <Section title="Draft workflow" description="This makes the draft feel like a review workspace instead of just a giant field form.">
            <div className="grid gap-4 text-sm md:grid-cols-2">
              <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4">
                <p className="text-xs uppercase tracking-[0.18em] text-zinc-500">Record status</p>
                <p className="mt-2 text-base font-semibold text-zinc-900">{workflow?.status ?? "—"}</p>
              </div>
              <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4">
                <p className="text-xs uppercase tracking-[0.18em] text-zinc-500">Workflow status</p>
                <p className="mt-2 text-base font-semibold text-zinc-900">{workflow?.workflowStatus ?? "—"}</p>
              </div>
              <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4">
                <p className="text-xs uppercase tracking-[0.18em] text-zinc-500">Owner</p>
                <p className="mt-2 text-base font-medium text-zinc-900 break-all">{workflow?.ownerEmail ?? "—"}</p>
              </div>
              <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4">
                <p className="text-xs uppercase tracking-[0.18em] text-zinc-500">Lead broker</p>
                <p className="mt-2 text-base font-medium text-zinc-900">{workflow?.leadBroker ?? formData.leadBroker ?? "—"}</p>
              </div>
              <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4">
                <p className="text-xs uppercase tracking-[0.18em] text-zinc-500">Created via</p>
                <p className="mt-2 text-base font-medium text-zinc-900">{workflow?.createdVia ?? "—"}</p>
              </div>
              <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4">
                <p className="text-xs uppercase tracking-[0.18em] text-zinc-500">Intake status</p>
                <p className="mt-2 text-base font-medium text-zinc-900">{workflow?.intakeStatus ?? "—"}</p>
              </div>
              <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4">
                <p className="text-xs uppercase tracking-[0.18em] text-zinc-500">Photo count</p>
                <p className="mt-2 text-base font-semibold text-zinc-900">{workflow?.uploadedPhotoCount ?? mediaImages.length}</p>
              </div>
              <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4">
                <p className="text-xs uppercase tracking-[0.18em] text-zinc-500">Last updated</p>
                <p className="mt-2 text-base font-medium text-zinc-900">{workflow?.updatedAt ?? "—"}</p>
              </div>
            </div>
            <div className="mt-5 space-y-4">
              {(workflow?.enrichmentStatus || workflow?.countyRoutingSource || workflow?.researchSummary || workflow?.generatedCopy) ? (
                <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4 text-sm text-zinc-700 space-y-3">
                  <div className="flex flex-wrap gap-2 text-xs font-semibold">
                    {workflow?.enrichmentStatus ? <span className="rounded-full bg-blue-100 px-2.5 py-1 text-blue-700">Enrichment: {workflow.enrichmentStatus}</span> : null}
                    {workflow?.countyRoutingSource ? <span className="rounded-full bg-cyan-100 px-2.5 py-1 text-cyan-700">County source: {workflow.countyRoutingSource}{workflow?.countyRoutingStatus ? ` · ${workflow.countyRoutingStatus}` : ""}</span> : null}
                    {workflow?.generatedCopy?.generator ? <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-emerald-700">AI: {workflow.generatedCopy.generator}</span> : null}
                  </div>
                  {workflow?.countyRoutingNotes ? <p>{workflow.countyRoutingNotes}</p> : null}
                  <div className="grid gap-3 md:grid-cols-2">
                    <div className="rounded-2xl border border-white bg-white p-3">
                      <p className="text-xs uppercase tracking-[0.18em] text-zinc-500">Assessor pull</p>
                      <div className="mt-2 space-y-1">
                        <p>Parcel: {workflow?.researchSummary?.parcelNumber || formData.parcelId || "—"}</p>
                        <p>Total SF: {workflow?.researchSummary?.buildingSizeSf || formData.buildingSizeSf || "—"}</p>
                        <p>Acreage: {workflow?.researchSummary?.lotSizeAcres || formData.lotSizeAcres || "—"}</p>
                        <p>Zoning: {workflow?.researchSummary?.zoning || formData.zoning || "—"}</p>
                        <p>Property class: {workflow?.researchSummary?.propertyClass || formData.propertyClass || "—"}</p>
                      </div>
                    </div>
                    <div className="rounded-2xl border border-white bg-white p-3">
                      <p className="text-xs uppercase tracking-[0.18em] text-zinc-500">Extraction flags</p>
                      <div className="mt-2 space-y-1">
                        <p>Building SF: {workflow?.extractedFields?.buildingSizeSf ? "pulled" : "missing"}</p>
                        <p>Acreage: {workflow?.extractedFields?.lotSizeAcres ? "pulled" : "missing"}</p>
                        <p>Zoning: {workflow?.extractedFields?.zoning ? "pulled" : "missing"}</p>
                        <p>AI draft: {workflow?.extractedFields?.aiDraft ? "generated" : "missing"}</p>
                      </div>
                    </div>
                  </div>
                  {workflow?.researchSummary?.assessorImprovements?.length ? (
                    <div>
                      <p className="text-xs uppercase tracking-[0.18em] text-zinc-500">Assessor improvements</p>
                      <ul className="mt-2 list-disc space-y-1 pl-5">
                        {workflow.researchSummary.assessorImprovements.slice(0, 6).map((item) => (
                          <li key={item}>{item}</li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                  {workflow?.generatedCopy?.saleDescription || workflow?.generatedCopy?.locationDescription ? (
                    <div className="rounded-2xl border border-dashed border-zinc-300 bg-white p-3 space-y-2">
                      <p className="text-xs uppercase tracking-[0.18em] text-zinc-500">Generated copy snapshot</p>
                      {workflow.generatedCopy.saleTitle ? <p><span className="font-semibold text-zinc-900">Title:</span> {workflow.generatedCopy.saleTitle}</p> : null}
                      {workflow.generatedCopy.saleDescription ? <p className="line-clamp-4"><span className="font-semibold text-zinc-900">Sale:</span> {workflow.generatedCopy.saleDescription}</p> : null}
                      {workflow.generatedCopy.locationDescription ? <p className="line-clamp-4"><span className="font-semibold text-zinc-900">Location:</span> {workflow.generatedCopy.locationDescription}</p> : null}
                    </div>
                  ) : null}
                </div>
              ) : null}
              {workflow?.reviewChecklist ? (
                <div className={`rounded-2xl border p-4 text-sm ${checklistTone(workflow.reviewChecklist.checklistState)}`}>
                  <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.18em]">Checkpoint 3 review layer</p>
                      <p className="mt-2 text-base font-semibold text-zinc-900">{workflow.reviewChecklist.exceptionReason ?? "Auto-fill looks healthy. Ready for human confirmation and Buildout prep."}</p>
                    </div>
                    <span className="rounded-full border border-current/20 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em]">
                      {workflow.reviewChecklist.checklistState.replace(/_/g, " ")}
                    </span>
                  </div>
                  <div className="mt-4 grid gap-3 lg:grid-cols-2">
                    <div className="rounded-2xl border border-white/70 bg-white/70 p-4">
                      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-zinc-500">Scrape status</p>
                      <div className="mt-3 space-y-3">
                        <div>
                          <p className="font-medium text-zinc-900">Successful</p>
                          <ul className="mt-1 list-disc space-y-1 pl-5 text-zinc-700">
                            {(workflow.reviewChecklist.successfulScrapes.length ? workflow.reviewChecklist.successfulScrapes : ["None yet"]).map((item) => <li key={`success-${item}`}>{item}</li>)}
                          </ul>
                        </div>
                        <div>
                          <p className="font-medium text-zinc-900">Partial</p>
                          <ul className="mt-1 list-disc space-y-1 pl-5 text-zinc-700">
                            {(workflow.reviewChecklist.partialScrapes.length ? workflow.reviewChecklist.partialScrapes : ["None"] ).map((item) => <li key={`partial-${item}`}>{item}</li>)}
                          </ul>
                        </div>
                        <div>
                          <p className="font-medium text-zinc-900">Blocked</p>
                          <ul className="mt-1 list-disc space-y-1 pl-5 text-zinc-700">
                            {(workflow.reviewChecklist.blockedScrapes.length ? workflow.reviewChecklist.blockedScrapes : ["None"] ).map((item) => <li key={`blocked-${item}`}>{item}</li>)}
                          </ul>
                        </div>
                      </div>
                    </div>
                    <div className="rounded-2xl border border-white/70 bg-white/70 p-4">
                      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-zinc-500">Review & manual follow-up</p>
                      <div className="mt-3 space-y-3">
                        <div>
                          <p className="font-medium text-zinc-900">Auto-filled</p>
                          <ul className="mt-1 list-disc space-y-1 pl-5 text-zinc-700">
                            {(workflow.reviewChecklist.autoFilledFields.length ? workflow.reviewChecklist.autoFilledFields : ["None yet"]).map((item) => <li key={`autofill-${item}`}>{item}</li>)}
                          </ul>
                        </div>
                        <div>
                          <p className="font-medium text-zinc-900">Failed / missing</p>
                          <ul className="mt-1 list-disc space-y-1 pl-5 text-zinc-700">
                            {(workflow.reviewChecklist.failedAutoFillFields.length ? workflow.reviewChecklist.failedAutoFillFields : ["None"] ).map((item) => <li key={`failed-${item}`}>{item}</li>)}
                          </ul>
                        </div>
                        <div>
                          <p className="font-medium text-zinc-900">Needs human confirmation</p>
                          <ul className="mt-1 list-disc space-y-1 pl-5 text-zinc-700">
                            {(workflow.reviewChecklist.humanConfirmationNeeded.length ? workflow.reviewChecklist.humanConfirmationNeeded : ["None"] ).map((item) => <li key={`confirm-${item}`}>{item}</li>)}
                          </ul>
                        </div>
                        <div>
                          <p className="font-medium text-zinc-900">Manual research follow-up</p>
                          <ul className="mt-1 list-disc space-y-1 pl-5 text-zinc-700">
                            {(workflow.reviewChecklist.manualResearchNeeded.length ? workflow.reviewChecklist.manualResearchNeeded : ["None"] ).map((item) => <li key={`manual-${item}`}>{item}</li>)}
                          </ul>
                        </div>
                      </div>
                    </div>
                  </div>
                  <div className="mt-3 rounded-2xl border border-dashed border-white/80 bg-white/60 p-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-zinc-500">Structured Buildout handoff</p>
                    <div className="mt-3 grid gap-3 md:grid-cols-2">
                      <div>
                        <p className="font-medium text-zinc-900">Normalized / ready</p>
                        <ul className="mt-1 list-disc space-y-1 pl-5 text-zinc-700">
                          {(workflow.reviewChecklist.buildoutReadyFields.length ? workflow.reviewChecklist.buildoutReadyFields : ["None yet"]).map((item) => <li key={`buildout-ready-${item}`}>{item}</li>)}
                        </ul>
                      </div>
                      <div>
                        <p className="font-medium text-zinc-900">Still blocking Buildout</p>
                        <ul className="mt-1 list-disc space-y-1 pl-5 text-zinc-700">
                          {(workflow.reviewChecklist.buildoutMissingFields.length ? workflow.reviewChecklist.buildoutMissingFields : ["No blocking fields"]).map((item) => <li key={`buildout-missing-${item}`}>{item}</li>)}
                        </ul>
                      </div>
                    </div>
                  </div>
                </div>
              ) : null}
              <div className="grid gap-3 md:grid-cols-2">
                <button
                  type="button"
                  onClick={handleEnrichDraft}
                  disabled={!formData.slug || enrichState === "running"}
                  className="inline-flex w-full items-center justify-center rounded-2xl border border-blue-700 bg-blue-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {enrichState === "running" ? "Generating draft enrichment…" : "Generate Draft Enrichment"}
                </button>
                <button
                  type="button"
                  onClick={handleEnrichDraft}
                  disabled={!formData.slug || enrichState === "running"}
                  className="inline-flex w-full items-center justify-center rounded-2xl border border-zinc-900 bg-white px-5 py-3 text-sm font-semibold text-zinc-900 transition hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {enrichState === "running" ? "Retrying county pull…" : hasEnrichmentErrors ? "Retry County Enrichment" : "Re-run County Enrichment"}
                </button>
              </div>
              {(enrichMessage || workflow?.enrichmentLastRunAt || workflow?.missingFields?.length || workflow?.launchpadErrors?.length) && (
                <div className="rounded-2xl border border-dashed border-zinc-300 bg-zinc-50 p-4 text-sm text-zinc-600 space-y-2">
                  {enrichMessage ? <p>{enrichMessage}</p> : null}
                  {workflow?.enrichmentLastRunAt ? <p>Last enrichment run: {workflow.enrichmentLastRunAt}</p> : null}
                  {workflow?.missingFields?.length ? <p>Missing fields: {workflow.missingFields.join(", ")}</p> : null}
                  {workflow?.launchpadErrors?.length ? <p className="text-red-600">Last errors: {workflow.launchpadErrors.join(" | ")}</p> : null}
                </div>
              )}
              <div className="rounded-2xl border border-dashed border-zinc-300 bg-zinc-50 p-4 text-sm text-zinc-600">
                Goal state: broker submits the minimum, then this screen becomes the enrichment and review workspace where we deepen facts, strengthen copy, and finalize media before publish.
              </div>
            </div>
          </Section>

          <Section title={isAdmin ? "Approval & export" : "Review feedback"} description={isAdmin ? "Phase 3 admin controls for approve/reject decisions and Buildout-ready payload validation." : "Admin feedback loop so brokers can see exactly what needs to be fixed before resubmitting."}>
            <div className="space-y-5">
              <div className="grid gap-4 text-sm md:grid-cols-2">
                <div className={`rounded-2xl border p-4 ${workflow?.approvalStatus === "rejected" ? "border-amber-200 bg-amber-50" : "border-zinc-200 bg-zinc-50"}`}>
                  <p className="text-xs uppercase tracking-[0.18em] text-zinc-500">Approval status</p>
                  <p className="mt-2 text-base font-semibold text-zinc-900">{workflow?.approvalStatus ?? "pending"}</p>
                </div>
                <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4">
                  <p className="text-xs uppercase tracking-[0.18em] text-zinc-500">Current workflow</p>
                  <p className="mt-2 text-base font-semibold text-zinc-900">{workflow?.workflowStatus ?? "review"}</p>
                </div>
              </div>

              {workflow?.preflight ? (
                <div className={`rounded-2xl border p-4 text-sm ${preflightTone(workflow.preflight.status)}`}>
                  <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.18em]">Checkpoint 4 publish preflight</p>
                      <p className="mt-2 text-base font-semibold text-zinc-900">
                        {workflow.preflight.status === "blocked"
                          ? "Approval gate is blocked until the listed issues are fixed."
                          : workflow.preflight.status === "publish_ready_with_warnings"
                            ? "Approval gate is open, but this draft still carries warnings."
                            : "Approval gate is clear. This draft is publish-ready."}
                      </p>
                    </div>
                    <span className="rounded-full border border-current/20 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em]">
                      {workflow.preflight.status.replace(/_/g, " ")}
                    </span>
                  </div>
                  <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-5">
                    {Object.entries(workflow.preflight.sections).map(([key, section]) => (
                      <div key={key} className="rounded-2xl border border-white/70 bg-white/70 p-3">
                        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-zinc-500">{key}</p>
                        <p className="mt-2 font-medium text-zinc-900">{section.status}</p>
                        {section.blockers.length ? (
                          <ul className="mt-2 list-disc space-y-1 pl-5 text-zinc-700">
                            {section.blockers.slice(0, 3).map((item) => <li key={`${key}-block-${item}`}>{item}</li>)}
                          </ul>
                        ) : section.warnings.length ? (
                          <ul className="mt-2 list-disc space-y-1 pl-5 text-zinc-700">
                            {section.warnings.slice(0, 3).map((item) => <li key={`${key}-warn-${item}`}>{item}</li>)}
                          </ul>
                        ) : (
                          <p className="mt-2 text-zinc-600">Clean</p>
                        )}
                      </div>
                    ))}
                  </div>
                  <div className="mt-4 grid gap-3 md:grid-cols-2">
                    <div className="rounded-2xl border border-white/70 bg-white/70 p-4">
                      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-zinc-500">Blockers</p>
                      <ul className="mt-2 list-disc space-y-1 pl-5 text-zinc-700">
                        {(workflow.preflight.blockers.length ? workflow.preflight.blockers : ["None"]).map((item) => <li key={`preflight-blocker-${item}`}>{item}</li>)}
                      </ul>
                    </div>
                    <div className="rounded-2xl border border-white/70 bg-white/70 p-4">
                      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-zinc-500">Warnings</p>
                      <ul className="mt-2 list-disc space-y-1 pl-5 text-zinc-700">
                        {(workflow.preflight.warnings.length ? workflow.preflight.warnings : ["None"]).map((item) => <li key={`preflight-warning-${item}`}>{item}</li>)}
                      </ul>
                    </div>
                  </div>
                </div>
              ) : null}

              {(workflow?.approvalRejectionReason || workflow?.approvalDecisionNote) ? (
                <div className={`rounded-2xl border p-4 text-sm space-y-2 ${workflow?.approvalStatus === "rejected" ? "border-amber-200 bg-amber-50 text-amber-900" : "border-zinc-200 bg-zinc-50 text-zinc-700"}`}>
                  <p className="text-xs font-semibold uppercase tracking-[0.18em]">{workflow?.approvalStatus === "rejected" ? "Changes requested" : "Admin decision note"}</p>
                  {workflow?.approvalRejectionReason ? <p>{workflow.approvalRejectionReason}</p> : null}
                  {!workflow?.approvalRejectionReason && workflow?.approvalDecisionNote ? <p>{workflow.approvalDecisionNote}</p> : null}
                </div>
              ) : null}

              <div className="rounded-2xl border border-dashed border-zinc-300 bg-zinc-50 p-4 text-sm text-zinc-600 space-y-2">
                {workflow?.approvalSubmittedAt ? <p>Submitted for approval: {workflow.approvalSubmittedAt}</p> : null}
                {workflow?.approvalSubmittedBy ? <p>Submitted by: {workflow.approvalSubmittedBy}</p> : null}
                {workflow?.approvalDecidedAt ? <p>Last decision: {workflow.approvalDecidedAt}</p> : null}
                {workflow?.approvalDecidedBy ? <p>Decision by: {workflow.approvalDecidedBy}</p> : null}
              </div>

              {isAdmin ? (
                <>
                  <Field label="Admin decision note / send-back note">
                    <textarea className={`${inputClassName()} min-h-28`} value={approvalNote} onChange={(e) => setApprovalNote(e.target.value)} />
                  </Field>

                  <div className="grid gap-3 md:grid-cols-2">
                    <button
                      type="button"
                      onClick={() => handleApproval("approve")}
                      disabled={!formData.slug || approvalState === "saving" || Boolean(workflow?.preflight?.blockers.length)}
                      className="inline-flex w-full items-center justify-center rounded-2xl border border-emerald-700 bg-emerald-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {approvalState === "saving" ? "Saving decision…" : "Approve Property"}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleApproval("reject")}
                      disabled={!formData.slug || approvalState === "saving"}
                      className="inline-flex w-full items-center justify-center rounded-2xl border border-amber-700 bg-amber-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-amber-700 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {approvalState === "saving" ? "Saving decision…" : "Reject / Send Back"}
                    </button>
                  </div>
                  {approvalMessage ? <p className={`text-sm ${approvalState === "error" ? "text-red-600" : "text-zinc-700"}`}>{approvalMessage}</p> : null}

                  <div className="rounded-2xl border border-dashed border-zinc-300 bg-zinc-50 p-4 text-sm text-zinc-600">
                    Buildout preview remains an internal structuring/validation tool only. No live Buildout sync work is in scope.
                  </div>

                  <button
                    type="button"
                    onClick={handleBuildoutPreview}
                    disabled={!formData.slug || exportState === "running"}
                    className="inline-flex w-full items-center justify-center rounded-2xl border border-zinc-900 bg-zinc-900 px-5 py-3 text-sm font-semibold text-white transition hover:bg-black disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {exportState === "running" ? "Generating Buildout preview…" : "Generate Buildout Payload Preview"}
                  </button>
                  {exportMessage ? <p className={`text-sm ${exportState === "error" ? "text-red-600" : "text-zinc-700"}`}>{exportMessage}</p> : null}

                  {(exportMissingFields.length || exportWarnings.length || workflow?.buildoutPayloadVersion) && (
                    <div className="rounded-2xl border border-dashed border-zinc-300 bg-zinc-50 p-4 text-sm text-zinc-600 space-y-2">
                      {workflow?.buildoutPayloadVersion ? <p>Payload version: {workflow.buildoutPayloadVersion}</p> : null}
                      {exportMissingFields.length ? <p>Missing required fields: {exportMissingFields.join(", ")}</p> : <p>Missing required fields: none</p>}
                      {exportWarnings.length ? <p>Warnings: {exportWarnings.join(", ")}</p> : <p>Warnings: none</p>}
                      {workflow?.buildoutSyncError ? <p className="text-red-600">Sync error: {workflow.buildoutSyncError}</p> : null}
                    </div>
                  )}

                  {exportPreview ? (
                    <details className="rounded-2xl border border-zinc-200 bg-white p-4">
                      <summary className="cursor-pointer text-sm font-semibold text-zinc-900">View Buildout payload preview</summary>
                      <pre className="mt-4 overflow-x-auto rounded-2xl bg-zinc-950 p-4 text-xs text-zinc-100">{JSON.stringify(exportPreview, null, 2)}</pre>
                    </details>
                  ) : null}
                </>
              ) : (
                <div className="rounded-2xl border border-dashed border-zinc-300 bg-zinc-50 p-4 text-sm text-zinc-600">
                  If admin requested changes, update the draft, save, and click <span className="font-semibold text-zinc-900">Mark Ready for Approval</span> again when it is clean.
                </div>
              )}
            </div>
          </Section>

          <details className="rounded-3xl border border-zinc-200 bg-white p-8 shadow-sm">
            <summary className="cursor-pointer list-none text-2xl font-semibold tracking-tight">Source metadata & QA notes</summary>
            <p className="mt-3 text-sm text-zinc-500">
              Current form is focused on high-value Buildout/admin fields. Raw intake and research provenance remain preserved in Firestore/meta and can be expanded later without bloating the main editor.
            </p>
            <div className="mt-6 grid gap-5 md:grid-cols-2 text-sm text-zinc-600">
              <div><span className="font-medium text-zinc-900">Slug</span><div className="mt-1 break-all">{formData.slug || "—"}</div></div>
              <div><span className="font-medium text-zinc-900">Lead Broker</span><div className="mt-1">{formData.leadBroker || "—"}</div></div>
              <div><span className="font-medium text-zinc-900">Property Type ID</span><div className="mt-1">{formData.propertyTypeId || "—"}</div></div>
              <div><span className="font-medium text-zinc-900">Property Subtype ID</span><div className="mt-1">{formData.propertySubtypeId || "—"}</div></div>
            </div>
          </details>

          <section className="rounded-3xl border border-zinc-200 bg-white p-8 shadow-sm">
            <p className="text-sm font-medium uppercase tracking-[0.18em] text-zinc-500">Save status</p>
            <p className="mt-3 text-sm text-zinc-600">
              {saveState === "idle" && `${mode === "new" ? "Create" : "Update"} the property record directly in Firestore.`}
              {saveState === "saving" && "Saving to Listing Stream and syncing downstream to Ascendix…"}
              {saveState === "saved" && (errorMessage ?? "Saved successfully.")}
              {saveState === "error" && (errorMessage ?? "Save failed.")}
            </p>
            <div className="mt-6 space-y-3">
              <button
                type="submit"
                className="inline-flex w-full items-center justify-center rounded-2xl bg-zinc-900 px-5 py-3 text-sm font-semibold text-white transition hover:bg-zinc-700"
              >
                Save Property
              </button>
              <button
                type="button"
                onClick={handleMarkReady}
                disabled={!formData.slug || readyState === "saving" || Boolean(workflow?.preflight?.blockers.length)}
                className="inline-flex w-full items-center justify-center rounded-2xl border border-emerald-700 bg-emerald-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {readyState === "saving" ? "Submitting for approval…" : "Mark Ready for Approval"}
              </button>
            </div>
            {readyMessage ? <p className={`mt-3 text-sm ${readyState === "error" ? "text-red-600" : "text-emerald-700"}`}>{readyMessage}</p> : null}
          </section>
        </div>
      </div>
    </form>
  );
}
