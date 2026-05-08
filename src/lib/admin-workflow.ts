import "server-only";

import { db, PROPERTIES_COLLECTION } from "@/lib/firestore";

export type AdminWorkflowSnapshot = {
  documentId: string;
  slug: string;
  status: string | null;
  workflowStatus: string | null;
  ownerEmail: string | null;
  leadBroker: string | null;
  createdVia: string | null;
  intakeStatus: string | null;
  uploadedPhotoCount: number;
  updatedAt: string | null;
  enrichmentStatus: string | null;
  enrichmentSummary: string | null;
  enrichmentLastRunAt: string | null;
  missingFields: string[];
  countyRoutingStatus: string | null;
  countyRoutingSource: string | null;
  countyRoutingNotes: string | null;
  launchpadErrors: string[];
  extractedFields: {
    buildingSizeSf: boolean;
    lotSizeAcres: boolean;
    zoning: boolean;
    aiDraft: boolean;
  };
  researchSummary: {
    publicRecordsStatus: string | null;
    placesStatus: string | null;
    parcelNumber: string | null;
    buildingSizeSf: string | null;
    lotSizeAcres: string | null;
    zoning: string | null;
    propertyClass: string | null;
    assessorImprovements: string[];
  };
  generatedCopy: {
    saleTitle: string | null;
    saleDescription: string | null;
    locationDescription: string | null;
    exteriorDescription: string | null;
    saleBullets: string[];
    generator: string | null;
  };
  approvalStatus: string | null;
  approvalSubmittedAt: string | null;
  approvalSubmittedBy: string | null;
  approvalDecidedAt: string | null;
  approvalDecidedBy: string | null;
  approvalDecisionNote: string | null;
  approvalRejectionReason: string | null;
  buildoutReady: boolean;
  buildoutPayloadVersion: string | null;
  buildoutSyncStatus: string | null;
  buildoutSyncError: string | null;
  buildoutMissingFields: string[];
  buildoutWarnings: string[];
  reviewChecklist: {
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

function asString(value: unknown): string | null {
  if (value == null) return null;
  const trimmed = String(value).trim();
  return trimmed || null;
}

function uniq(values: Array<string | null | undefined | false>): string[] {
  return Array.from(new Set(values.filter(Boolean) as string[]));
}

function present(value: unknown) {
  return Boolean(asString(value));
}

export async function getAdminWorkflowSnapshot(slug: string): Promise<AdminWorkflowSnapshot | null> {
  const query = await db.collection(PROPERTIES_COLLECTION).where("slug", "==", slug).limit(1).get();
  const doc = !query.empty ? query.docs[0] : await db.collection(PROPERTIES_COLLECTION).doc(slug).get();
  if (!doc.exists) return null;

  const raw = (doc.data() as Record<string, any> | undefined) ?? {};
  const meta = raw.meta ?? {};
  const intake = meta.intake ?? {};
  const enrichment = meta.enrichment ?? {};
  const approval = meta.approval ?? {};
  const exportMeta = meta.export ?? {};
  const research = meta.research ?? {};
  const copy = meta.copy ?? {};
  const publicRecords = research.public_records ?? {};
  const places = research.places ?? {};
  const streetView = research.street_view ?? {};
  const countyRouting = enrichment.countyRouting ?? {};
  const extractedFields = enrichment.extractedFields ?? {};
  const buildoutMissingFields = Array.isArray(exportMeta.missingRequiredFields)
    ? exportMeta.missingRequiredFields.map((field: unknown) => asString(field)).filter(Boolean)
    : [];
  const buildoutWarnings = Array.isArray(exportMeta.warnings)
    ? exportMeta.warnings.map((field: unknown) => asString(field)).filter(Boolean)
    : [];

  const successfulScrapes = uniq([
    ["ok", "completed"].includes(asString(publicRecords.status) || "") ? `Public records · ${asString(countyRouting.assessorSource) || "county source"}` : null,
    ["ok", "completed"].includes(asString(places.status) || "") ? "Places / neighborhood context" : null,
    ["ok", "completed"].includes(asString(streetView.status) || "") ? "Street view / imagery context" : null,
  ]);

  const partialScrapes = uniq([
    asString(enrichment.status) === "partial" ? "Enrichment returned partial extraction" : null,
    asString(publicRecords.status) === "partial" ? "Public records partial" : null,
    asString(places.status) === "partial" ? "Places / neighborhood partial" : null,
    asString(streetView.status) === "partial" ? "Street view partial" : null,
  ]);

  const blockedScrapes = uniq([
    ["blocked", "login_gated", "error", "no_results"].includes(asString(publicRecords.status) || "") ? `Public records blocked (${asString(publicRecords.status)})` : null,
    ["blocked", "error"].includes(asString(places.status) || "") ? `Places blocked (${asString(places.status)})` : null,
    ["blocked", "error"].includes(asString(streetView.status) || "") ? `Street view blocked (${asString(streetView.status)})` : null,
    ...(Array.isArray(enrichment.launchpadErrors)
      ? enrichment.launchpadErrors.map((item: unknown) => {
          const value = asString(item);
          return value ? `Launchpad: ${value}` : null;
        })
      : []),
  ]);

  const autoFilledFields = uniq([
    present(publicRecords.parcel_number) ? "Parcel ID" : null,
    present(publicRecords.building_size_sf) ? "Building size" : null,
    present(publicRecords.lot_size_acres) ? "Lot size" : null,
    present(publicRecords.year_built) ? "Year built" : null,
    present(publicRecords.zoning) ? "Zoning" : null,
    present(copy.sale_title) ? "Sale title" : null,
    present(copy.sale_description) ? "Sale description" : null,
    present(copy.location_description) ? "Location description" : null,
    present(copy.exterior_description) ? "Exterior description" : null,
  ]);

  const missingFieldLabels: Record<string, string> = {
    title: "Title",
    address: "Address",
    propertyType: "Property type",
    parcelId: "Parcel ID",
    buildingSizeSf: "Building size",
    lotSizeAcres: "Lot size",
    yearBuilt: "Year built",
    zoning: "Zoning",
    salePrice: "Sale price",
    saleDescription: "Sale description",
    locationDescription: "Location description",
  };

  const failedAutoFillFields = uniq(
    (Array.isArray(enrichment.missingFields) ? enrichment.missingFields : [])
      .map((field: unknown) => missingFieldLabels[asString(field) || ""] || asString(field))
      .filter(Boolean),
  );

  const humanConfirmationNeeded = uniq([
    present(publicRecords.building_size_sf) ? "Confirm building size against source docs" : null,
    present(publicRecords.lot_size_acres) ? "Confirm lot size / acreage" : null,
    present(publicRecords.zoning) ? "Confirm zoning / allowable use" : null,
    present(copy.sale_description) ? "Review generated marketing copy" : null,
    buildoutWarnings.length ? "Resolve Buildout preview warnings" : null,
  ]);

  const buildoutReadyFields = uniq([
    !buildoutMissingFields.includes("title") ? "Title" : null,
    !buildoutMissingFields.includes("address.street") ? "Street address" : null,
    !buildoutMissingFields.includes("address.city") ? "City" : null,
    !buildoutMissingFields.includes("address.state") ? "State" : null,
    !buildoutMissingFields.includes("property.category") ? "Property category" : null,
    !buildoutMissingFields.includes("content.saleTitle") ? "Buildout title" : null,
    !buildoutMissingFields.includes("content.saleDescription") ? "Sale description" : null,
    !buildoutMissingFields.includes("content.locationDescription") ? "Location description" : null,
  ]);

  const buildoutMissingFieldLabels = uniq(
    buildoutMissingFields.map((field: string) => ({
      "title": "Title",
      "address.street": "Street address",
      "address.city": "City",
      "address.state": "State",
      "property.category": "Property category",
      "content.saleTitle": "Buildout title",
      "content.saleDescription": "Sale description",
      "content.locationDescription": "Location description",
    }[field] || field)),
  );

  const manualResearchNeeded = uniq([
    ...failedAutoFillFields,
    blockedScrapes.length ? "Blocked data source follow-up" : null,
    buildoutMissingFieldLabels.length ? "Buildout-required fields still missing" : null,
    autoFilledFields.length < 4 ? "Thin extraction needs manual research" : null,
  ]);

  const exceptionReason =
    blockedScrapes.length > 0
      ? "Blocked source needs manual follow-up"
      : failedAutoFillFields.length >= 2 || autoFilledFields.length < 4
        ? "Thin extraction needs manual follow-up"
        : buildoutMissingFieldLabels.length >= 2
          ? "Buildout handoff not normalized yet"
          : null;

  const checklistState = blockedScrapes.length
    ? "blocked"
    : exceptionReason
      ? "needs_manual_followup"
      : "ready";

  return {
    documentId: doc.id,
    slug: asString(raw.slug) ?? doc.id,
    status: asString(raw.status),
    workflowStatus: asString(raw.workflowStatus),
    ownerEmail: asString(raw.ownerEmail) ?? asString(raw.ownerUserId),
    leadBroker: asString(raw.leadBroker) ?? asString(raw.admin?.leadBroker),
    createdVia: asString(meta.createdVia),
    intakeStatus: asString(meta.intakeStatus),
    uploadedPhotoCount: Number(intake.uploaded_photo_count ?? raw.media?.images?.length ?? 0) || 0,
    updatedAt: asString(raw.updatedAt) ?? asString(meta.updatedAt),
    enrichmentStatus: asString(enrichment.status),
    enrichmentSummary: asString(enrichment.summary),
    enrichmentLastRunAt: asString(enrichment.lastRunAt),
    missingFields: Array.isArray(enrichment.missingFields)
      ? enrichment.missingFields.map((field: unknown) => asString(field)).filter(Boolean)
      : [],
    countyRoutingStatus: asString(countyRouting.status),
    countyRoutingSource: asString(countyRouting.assessorSource),
    countyRoutingNotes: asString(countyRouting.notes),
    launchpadErrors: Array.isArray(enrichment.launchpadErrors)
      ? enrichment.launchpadErrors.map((field: unknown) => asString(field)).filter(Boolean)
      : [],
    extractedFields: {
      buildingSizeSf: extractedFields.buildingSizeSf === true,
      lotSizeAcres: extractedFields.lotSizeAcres === true,
      zoning: extractedFields.zoning === true,
      aiDraft: extractedFields.aiDraft === true,
    },
    researchSummary: {
      publicRecordsStatus: asString(publicRecords.status),
      placesStatus: asString(places.status),
      parcelNumber: asString(publicRecords.parcel_number),
      buildingSizeSf: asString(publicRecords.building_size_sf),
      lotSizeAcres: asString(publicRecords.lot_size_acres),
      zoning: asString(publicRecords.zoning),
      propertyClass: asString(publicRecords.property_class),
      assessorImprovements: Array.isArray(publicRecords.assessor_improvements)
        ? publicRecords.assessor_improvements.map((item: unknown) => asString(item)).filter(Boolean)
        : [],
    },
    generatedCopy: {
      saleTitle: asString(copy.sale_title),
      saleDescription: asString(copy.sale_description),
      locationDescription: asString(copy.location_description),
      exteriorDescription: asString(copy.exterior_description),
      saleBullets: Array.isArray(copy.sale_bullets) ? copy.sale_bullets.map((item: unknown) => asString(item)).filter(Boolean) : [],
      generator: asString(copy.generator),
    },
    approvalStatus: asString(approval.status),
    approvalSubmittedAt: asString(approval.submittedAt),
    approvalSubmittedBy: asString(approval.submittedBy),
    approvalDecidedAt: asString(approval.decidedAt),
    approvalDecidedBy: asString(approval.decidedBy),
    approvalDecisionNote: asString(approval.decisionNote),
    approvalRejectionReason: asString(approval.rejectionReason),
    buildoutReady: exportMeta.buildoutReady === true,
    buildoutPayloadVersion: asString(exportMeta.buildoutPayloadVersion),
    buildoutSyncStatus: asString(exportMeta.buildoutSyncStatus),
    buildoutSyncError: asString(exportMeta.buildoutSyncError),
    buildoutMissingFields,
    buildoutWarnings,
    reviewChecklist: {
      successfulScrapes,
      partialScrapes,
      blockedScrapes,
      manualResearchNeeded,
      autoFilledFields,
      failedAutoFillFields,
      humanConfirmationNeeded,
      buildoutReadyFields,
      buildoutMissingFields: buildoutMissingFieldLabels,
      exceptionReason,
      checklistState,
    },
  };
}
