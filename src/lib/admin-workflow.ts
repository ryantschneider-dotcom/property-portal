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
  enrichmentSummary: string | null;
  enrichmentLastRunAt: string | null;
  missingFields: string[];
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
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
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
    enrichmentSummary: asString(enrichment.summary),
    enrichmentLastRunAt: asString(enrichment.lastRunAt),
    missingFields: Array.isArray(enrichment.missingFields)
      ? enrichment.missingFields.map((field: unknown) => asString(field)).filter(Boolean)
      : [],
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
