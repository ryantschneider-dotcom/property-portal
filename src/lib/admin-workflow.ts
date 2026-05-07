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
};

function asString(value: unknown): string | null {
  if (value == null) return null;
  const trimmed = String(value).trim();
  return trimmed || null;
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
  const countyRouting = enrichment.countyRouting ?? {};
  const extractedFields = enrichment.extractedFields ?? {};

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
    buildoutMissingFields: Array.isArray(exportMeta.missingRequiredFields)
      ? exportMeta.missingRequiredFields.map((field: unknown) => asString(field)).filter(Boolean)
      : [],
    buildoutWarnings: Array.isArray(exportMeta.warnings)
      ? exportMeta.warnings.map((field: unknown) => asString(field)).filter(Boolean)
      : [],
  };
}
