import "server-only";

import { getPropertyDocumentByIdentifier } from "@/lib/properties";

export type AdminPreflightSnapshot = {
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

type WorkflowCategory = {
  code: string;
  title: string;
  severity: "warning" | "blocker";
  items: string[];
};

type WorkflowBrokerResponse = {
  id: string | null;
  createdAt: string | null;
  createdByEmail: string | null;
  createdByName: string | null;
  instructions: string | null;
  uploadedAssetCount: number;
  status: string | null;
};

type WorkflowRequest = {
  id: string | null;
  createdAt: string | null;
  createdBy: string | null;
  createdByName: string | null;
  status: string | null;
  summary: string | null;
  categories: WorkflowCategory[];
  brokerResponse: WorkflowBrokerResponse | null;
  brokerUpdatedAt: string | null;
  brokerUpdatedBy: string | null;
  closedAt: string | null;
  closedBy: string | null;
};

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
  launchPackage: {
    status: string | null;
    builtAt: string | null;
    builtBy: string | null;
    version: string | null;
    warnings: string[];
    notes: string[];
  };
  exportWorkflow: {
    status: string | null;
    destination: string | null;
    readyReasons: string[];
    blockingReasons: string[];
    warningReasons: string[];
    packageStatus: string | null;
    packageVersion: string | null;
    lastPackagedAt: string | null;
    lastPackagedBy: string | null;
  };
  exportArtifacts: {
    buildoutPayloadVersion: string | null;
    launchSummaryVersion: string | null;
    mediaManifestVersion: string | null;
    packageBuiltAt: string | null;
  };
  preflight: AdminPreflightSnapshot;
  revisionWorkflow: {
    currentRequest: WorkflowRequest | null;
    history: WorkflowRequest[];
    historyCount: number;
  };
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

function labelBuildoutField(field: string) {
  return ({
    title: "Title",
    "address.street": "Street address",
    "address.city": "City",
    "address.state": "State",
    "address.county": "County",
    "property.category": "Property category",
    "property.parcelId": "Parcel ID",
    "property.zoning": "Zoning",
    "property.size": "Building size or lot size",
    "property.availableSqFt": "Available square footage",
    "broker.leadBroker": "Lead broker",
    "media.images": "At least one property photo",
    "pricing.sale": "Sale pricing",
    "pricing.lease": "Lease pricing",
    "content.saleTitle": "Buildout title",
    "content.saleDescription": "Sale description",
    "content.leaseDescription": "Lease description",
    "content.locationDescription": "Location description",
  }[field] || field);
}

function makeSection(blockers: string[], warnings: string[]) {
  return {
    status: blockers.length ? "blocked" : warnings.length ? "warning" : "ok",
    blockers,
    warnings,
  } as const;
}

function normalizeCategories(input: unknown): WorkflowCategory[] {
  if (!Array.isArray(input)) return [];
  return input.map((category: any) => ({
    code: asString(category.code) || "",
    title: asString(category.title) || asString(category.code) || "",
    severity: category.severity === "warning" ? "warning" : "blocker",
    items: Array.isArray(category.items) ? category.items.map((item: unknown) => asString(item)).filter(Boolean) : [],
  }));
}

function normalizeBrokerResponse(input: unknown): WorkflowBrokerResponse | null {
  if (!input || typeof input !== "object") return null;
  const row = input as Record<string, any>;
  return {
    id: asString(row.id),
    createdAt: asString(row.createdAt),
    createdByEmail: asString(row.createdByEmail),
    createdByName: asString(row.createdByName),
    instructions: asString(row.instructions),
    uploadedAssetCount: Number(row.uploadedAssetCount ?? 0) || 0,
    status: asString(row.status),
  };
}

function normalizeWorkflowRequest(input: unknown): WorkflowRequest | null {
  if (!input || typeof input !== "object") return null;
  const row = input as Record<string, any>;
  return {
    id: asString(row.id),
    createdAt: asString(row.createdAt),
    createdBy: asString(row.createdBy),
    createdByName: asString(row.createdByName),
    status: asString(row.status),
    summary: asString(row.summary),
    categories: normalizeCategories(row.categories),
    brokerResponse: normalizeBrokerResponse(row.brokerResponse),
    brokerUpdatedAt: asString(row.brokerUpdatedAt),
    brokerUpdatedBy: asString(row.brokerUpdatedBy),
    closedAt: asString(row.closedAt),
    closedBy: asString(row.closedBy),
  };
}

export function evaluateAdminPreflight(raw: Record<string, any>): AdminPreflightSnapshot {
  const meta = raw.meta ?? {};
  const exportMeta = meta.export ?? {};
  const media = raw.media ?? {};
  const address = raw.address ?? {};
  const property = raw.property ?? {};
  const pricing = raw.pricing ?? {};
  const content = raw.content ?? {};
  const visibility = raw.visibility ?? {};
  const admin = raw.admin ?? {};
  const images = Array.isArray(media.images) ? media.images : [];
  const suites = Array.isArray(admin.suites) ? admin.suites : [];
  const buildoutMissingFields = Array.isArray(exportMeta.missingRequiredFields)
    ? exportMeta.missingRequiredFields.map((field: unknown) => asString(field)).filter(Boolean)
    : [];
  const buildoutWarnings = Array.isArray(exportMeta.warnings)
    ? exportMeta.warnings.map((field: unknown) => asString(field)).filter(Boolean)
    : [];
  const transactionLabel = asString(visibility.transactionLabel) || "";
  const saleActive = visibility.saleActive === true || transactionLabel.toLowerCase().includes("sale");
  const leaseActive = visibility.leaseActive === true || transactionLabel.toLowerCase().includes("lease");

  const identityBlockers = uniq([
    present(raw.title) ? null : "Title missing",
    present(address.street) ? null : "Street address missing",
    present(address.city) ? null : "City missing",
    present(address.state) ? null : "State missing",
    present(address.county) ? null : "County missing",
    present(property.category) ? null : "Property type missing",
    saleActive || leaseActive ? null : "Transaction visibility missing",
    present(property.parcelId) ? null : "Parcel ID missing",
    present(raw.leadBroker) || present(admin.leadBroker) || present(raw.ownerEmail) || present(raw.ownerUserId) ? null : "Lead broker / owner missing",
  ]);
  const identityWarnings = uniq([present(address.zip) ? null : "ZIP not set"]);

  const hasSalePrice = present(pricing.salePriceDollars) || pricing.salePriceIsCallForPrice === true || present(pricing.hiddenPriceLabel);
  const completeSuites = suites.filter((suite: Record<string, any>) => present(suite.suiteNumber) && present(suite.availableSqFt) && (present(suite.baseRent) || suite.unpriced === true) && present(suite.rentType));
  const pricingBlockers = uniq([
    saleActive && !hasSalePrice ? "Sale pricing missing" : null,
    leaseActive && completeSuites.length === 0 && !present(pricing.askingPriceRatePerSf) ? "Lease suite pricing missing" : null,
    leaseActive && !present(pricing.availableSqFt) && completeSuites.length === 0 ? "Available SF missing for lease" : null,
    present(property.buildingSizeSf) || present(property.lotSizeAcres) ? null : "Building size or lot size missing",
    present(property.zoning) ? null : "Zoning missing",
  ]);
  const pricingWarnings = uniq([present(property.yearBuilt) ? null : "Year built missing", present(admin.parking) || present(property.parking) ? null : "Parking details missing"]);

  const mediaBlockers = uniq([images.length > 0 ? null : "At least one property photo is required"]);
  const mediaWarnings = uniq([images.some((image: Record<string, any>) => image?.isPrimary === true) || images.length <= 1 ? null : "Hero image flag not set on gallery"]);

  const copyBlockers = uniq([
    present(content.saleTitle) || present(raw.title) ? null : "Listing title not finalized",
    saleActive && !present(content.saleDescription) ? "Sale description missing" : null,
    leaseActive && !present(content.leaseDescription) ? "Lease description missing" : null,
    present(content.locationDescription) ? null : "Location description missing",
    (Array.isArray(content.saleBullets) && content.saleBullets.length > 0) || (Array.isArray(content.leaseBullets) && content.leaseBullets.length > 0) ? null : "At least one listing bullet is required",
  ]);
  const copyWarnings = uniq([present(content.exteriorDescription) ? null : "Exterior description missing"]);

  const buildoutBlockers = uniq(buildoutMissingFields.map((field: string) => labelBuildoutField(field)));
  const buildoutSectionWarnings = uniq(buildoutWarnings.map((field: string) => labelBuildoutField(field)));

  const sections = {
    identity: makeSection(identityBlockers, identityWarnings),
    pricing: makeSection(pricingBlockers, pricingWarnings),
    media: makeSection(mediaBlockers, mediaWarnings),
    copy: makeSection(copyBlockers, copyWarnings),
    buildout: makeSection(buildoutBlockers, buildoutSectionWarnings),
  };

  const blockers = uniq(Object.values(sections).flatMap((section) => section.blockers));
  const warnings = uniq(Object.values(sections).flatMap((section) => section.warnings));

  return { status: blockers.length ? "blocked" : warnings.length ? "publish_ready_with_warnings" : "publish_ready", blockers, warnings, sections };
}

export async function getAdminWorkflowSnapshot(slug: string): Promise<AdminWorkflowSnapshot | null> {
  const doc = await getPropertyDocumentByIdentifier(slug);
  if (!doc?.exists) return null;

  const raw = (doc.data() as Record<string, any> | undefined) ?? {};
  const meta = raw.meta ?? {};
  const intake = meta.intake ?? {};
  const enrichment = meta.enrichment ?? {};
  const approval = meta.approval ?? {};
  const revisionWorkflow = meta.revisionWorkflow ?? {};
  const exportMeta = meta.export ?? {};
  const launchPackage = meta.launchPackage ?? {};
  const exportWorkflow = meta.exportWorkflow ?? {};
  const exportArtifacts = meta.exportArtifacts ?? {};
  const research = meta.research ?? {};
  const copy = meta.copy ?? {};
  const publicRecords = research.public_records ?? {};
  const places = research.places ?? {};
  const streetView = research.street_view ?? {};
  const countyRouting = enrichment.countyRouting ?? {};
  const extractedFields = enrichment.extractedFields ?? {};
  const buildoutMissingFields = Array.isArray(exportMeta.missingRequiredFields) ? exportMeta.missingRequiredFields.map((field: unknown) => asString(field)).filter(Boolean) : [];
  const buildoutWarnings = Array.isArray(exportMeta.warnings) ? exportMeta.warnings.map((field: unknown) => asString(field)).filter(Boolean) : [];

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
    ...(Array.isArray(enrichment.launchpadErrors) ? enrichment.launchpadErrors.map((item: unknown) => { const value = asString(item); return value ? `Launchpad: ${value}` : null; }) : []),
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

  const failedAutoFillFields = uniq((Array.isArray(enrichment.missingFields) ? enrichment.missingFields : []).map((field: unknown) => missingFieldLabels[asString(field) || ""] || asString(field)).filter(Boolean));
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
    !buildoutMissingFields.includes("address.county") ? "County" : null,
    !buildoutMissingFields.includes("property.category") ? "Property category" : null,
    !buildoutMissingFields.includes("property.parcelId") ? "Parcel ID" : null,
    !buildoutMissingFields.includes("property.zoning") ? "Zoning" : null,
    !buildoutMissingFields.includes("content.saleTitle") ? "Buildout title" : null,
    !buildoutMissingFields.includes("content.saleDescription") ? "Sale description" : null,
    !buildoutMissingFields.includes("content.leaseDescription") ? "Lease description" : null,
    !buildoutMissingFields.includes("content.locationDescription") ? "Location description" : null,
  ]);
  const buildoutMissingFieldLabels = uniq(buildoutMissingFields.map((field: string) => labelBuildoutField(field)));
  const manualResearchNeeded = uniq([...failedAutoFillFields, blockedScrapes.length ? "Blocked data source follow-up" : null, buildoutMissingFieldLabels.length ? "Buildout-required fields still missing" : null, autoFilledFields.length < 4 ? "Thin extraction needs manual research" : null]);
  const exceptionReason = blockedScrapes.length > 0 ? "Blocked source needs manual follow-up" : failedAutoFillFields.length >= 2 || autoFilledFields.length < 4 ? "Thin extraction needs manual follow-up" : buildoutMissingFieldLabels.length >= 2 ? "Buildout handoff not normalized yet" : null;
  const checklistState = blockedScrapes.length ? "blocked" : exceptionReason ? "needs_manual_followup" : "ready";
  const preflight = evaluateAdminPreflight(raw);
  const currentRevisionRequest = normalizeWorkflowRequest(revisionWorkflow.currentRequest);
  const history = Array.isArray(revisionWorkflow.history) ? revisionWorkflow.history.map(normalizeWorkflowRequest).filter(Boolean) as WorkflowRequest[] : [];

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
    missingFields: Array.isArray(enrichment.missingFields) ? enrichment.missingFields.map((field: unknown) => asString(field)).filter(Boolean) : [],
    countyRoutingStatus: asString(countyRouting.status),
    countyRoutingSource: asString(countyRouting.assessorSource),
    countyRoutingNotes: asString(countyRouting.notes),
    launchpadErrors: Array.isArray(enrichment.launchpadErrors) ? enrichment.launchpadErrors.map((field: unknown) => asString(field)).filter(Boolean) : [],
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
      assessorImprovements: Array.isArray(publicRecords.assessor_improvements) ? publicRecords.assessor_improvements.map((item: unknown) => asString(item)).filter(Boolean) : [],
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
    launchPackage: {
      status: asString(launchPackage.status),
      builtAt: asString(launchPackage.builtAt),
      builtBy: asString(launchPackage.builtBy),
      version: asString(launchPackage.version),
      warnings: Array.isArray(launchPackage.warnings) ? launchPackage.warnings.map((item: unknown) => asString(item)).filter(Boolean) : [],
      notes: Array.isArray(launchPackage.notes) ? launchPackage.notes.map((item: unknown) => asString(item)).filter(Boolean) : [],
    },
    exportWorkflow: {
      status: asString(exportWorkflow.status),
      destination: asString(exportWorkflow.destination),
      readyReasons: Array.isArray(exportWorkflow.readyReasons) ? exportWorkflow.readyReasons.map((item: unknown) => asString(item)).filter(Boolean) : [],
      blockingReasons: Array.isArray(exportWorkflow.blockingReasons) ? exportWorkflow.blockingReasons.map((item: unknown) => asString(item)).filter(Boolean) : [],
      warningReasons: Array.isArray(exportWorkflow.warningReasons) ? exportWorkflow.warningReasons.map((item: unknown) => asString(item)).filter(Boolean) : [],
      packageStatus: asString(exportWorkflow.packageStatus),
      packageVersion: asString(exportWorkflow.packageVersion),
      lastPackagedAt: asString(exportWorkflow.lastPackagedAt),
      lastPackagedBy: asString(exportWorkflow.lastPackagedBy),
    },
    exportArtifacts: {
      buildoutPayloadVersion: asString(exportArtifacts.buildoutPayloadVersion),
      launchSummaryVersion: asString(exportArtifacts.launchSummaryVersion),
      mediaManifestVersion: asString(exportArtifacts.mediaManifestVersion),
      packageBuiltAt: asString(exportArtifacts.packageBuiltAt),
    },
    preflight,
    revisionWorkflow: {
      currentRequest: currentRevisionRequest,
      history,
      historyCount: history.length,
    },
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
