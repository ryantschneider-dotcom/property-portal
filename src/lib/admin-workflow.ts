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
  };
}
