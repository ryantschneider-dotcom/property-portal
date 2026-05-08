import "server-only";

import { FieldValue } from "firebase-admin/firestore";

import { db, PROPERTIES_COLLECTION, storage } from "@/lib/firestore";

function asString(value: unknown) {
  return value == null ? "" : String(value);
}

function normalizeText(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().replace(/\s+/g, " ");
}

export function buildAddressKey(addressStreet: string, city: string, state: string) {
  return normalizeText([addressStreet, city, state].filter(Boolean).join(" "));
}

async function findPropertyDocBySlug(slug: string) {
  const query = await db.collection(PROPERTIES_COLLECTION).where("slug", "==", slug).limit(1).get();
  const doc = !query.empty ? query.docs[0] : await db.collection(PROPERTIES_COLLECTION).doc(slug).get();
  if (!doc.exists) return null;
  return doc;
}

export type DuplicateListingMatch = {
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

export async function findDuplicateListings(input: { addressStreet: string; city: string; state: string; normalizedParcelId: string }) {
  const targetAddressKey = buildAddressKey(input.addressStreet, input.city, input.state);
  const targetParcelId = normalizeText(input.normalizedParcelId);
  if (!targetAddressKey && !targetParcelId) return [] as DuplicateListingMatch[];

  const snapshot = await db.collection(PROPERTIES_COLLECTION).get();
  return snapshot.docs
    .map((doc) => {
      const data = doc.data() as Record<string, unknown>;
      const address = (data.address as Record<string, unknown> | undefined) ?? {};
      const property = (data.property as Record<string, unknown> | undefined) ?? {};
      const meta = (data.meta as Record<string, unknown> | undefined) ?? {};
      const intake = (meta.intake as Record<string, unknown> | undefined) ?? {};
      const storedAddressKey = buildAddressKey(
        asString(address.street || intake.address_street || intake.street_name),
        asString(address.city || intake.city),
        asString(address.state || intake.state),
      );
      const storedParcelId = normalizeText(asString(property.parcelId || intake.parcel_id_normalized || intake.parcel_id_raw || intake.tax_id));
      const matchedOn: Array<"address" | "parcel"> = [];
      if (targetAddressKey && storedAddressKey && storedAddressKey === targetAddressKey) matchedOn.push("address");
      if (targetParcelId && storedParcelId && storedParcelId === targetParcelId) matchedOn.push("parcel");
      if (!matchedOn.length) return null;
      const workflowStatus = asString(data.workflowStatus) || null;
      const status = asString(data.status) || null;
      return {
        id: doc.id,
        slug: asString(data.slug) || doc.id,
        title: asString(data.title) || null,
        address: asString(address.full || address.street) || null,
        parcelId: asString(property.parcelId || intake.parcel_id_normalized || intake.parcel_id_raw) || null,
        workflowStatus,
        status,
        archived: workflowStatus === "archived" || status === "archived",
        matchedOn,
      } satisfies DuplicateListingMatch;
    })
    .filter((item): item is DuplicateListingMatch => Boolean(item))
    .sort((a, b) => Number(b.archived) - Number(a.archived));
}

export async function archiveProperty(slug: string, actorEmail: string) {
  const doc = await findPropertyDocBySlug(slug);
  if (!doc) throw new Error("Property not found");

  const raw = (doc.data() as Record<string, unknown> | undefined) ?? {};
  const currentStatus = asString(raw.status) || "active";
  const currentWorkflowStatus = asString(raw.workflowStatus) || "draft";

  await db.collection(PROPERTIES_COLLECTION).doc(doc.id).set({
    status: "inactive",
    workflowStatus: "archived",
    updatedByUserId: actorEmail,
    meta: {
      updatedAt: FieldValue.serverTimestamp(),
      lifecycle: {
        archivedAt: FieldValue.serverTimestamp(),
        archivedBy: actorEmail,
        previousStatus: currentStatus,
        previousWorkflowStatus: currentWorkflowStatus,
      },
    },
  }, { merge: true });

  return { id: doc.id, slug: asString(raw.slug) || doc.id, workflowStatus: "archived" };
}

export async function restoreProperty(slug: string, actorEmail: string) {
  const doc = await findPropertyDocBySlug(slug);
  if (!doc) throw new Error("Property not found");

  const raw = (doc.data() as Record<string, unknown> | undefined) ?? {};
  const meta = (raw.meta as Record<string, unknown> | undefined) ?? {};
  const lifecycle = (meta.lifecycle as Record<string, unknown> | undefined) ?? {};
  const restoredStatus = asString(lifecycle.previousStatus) || "active";
  const restoredWorkflowStatus = asString(lifecycle.previousWorkflowStatus) || "needs_input";

  await db.collection(PROPERTIES_COLLECTION).doc(doc.id).set({
    status: restoredStatus,
    workflowStatus: restoredWorkflowStatus,
    updatedByUserId: actorEmail,
    meta: {
      updatedAt: FieldValue.serverTimestamp(),
      lifecycle: {
        restoredAt: FieldValue.serverTimestamp(),
        restoredBy: actorEmail,
      },
    },
  }, { merge: true });

  return { id: doc.id, slug: asString(raw.slug) || doc.id, workflowStatus: restoredWorkflowStatus };
}

export async function hardDeleteProperty(slug: string) {
  const doc = await findPropertyDocBySlug(slug);
  if (!doc) throw new Error("Property not found");

  const raw = (doc.data() as Record<string, unknown> | undefined) ?? {};
  const media = (raw.media as Record<string, unknown> | undefined) ?? {};
  const images = Array.isArray(media.images) ? media.images as Array<Record<string, unknown>> : [];
  const documents = Array.isArray(media.documents) ? media.documents as Array<Record<string, unknown>> : [];
  const filePaths = new Set<string>();

  for (const item of [...images, ...documents]) {
    const pathValue = asString(item.path);
    if (pathValue) filePaths.add(pathValue);
  }

  const bucket = storage.bucket();
  await Promise.allSettled([
    ...Array.from(filePaths).map((filePath) => bucket.file(filePath).delete({ ignoreNotFound: true })),
    bucket.deleteFiles({ prefix: `broker-hub/intake/${asString(raw.slug) || doc.id}/`, force: true }),
    bucket.deleteFiles({ prefix: `broker-hub/revision/${asString(raw.slug) || doc.id}/`, force: true }),
    bucket.deleteFiles({ prefix: `property-intake/${asString(raw.slug) || doc.id}/`, force: true }),
    bucket.deleteFiles({ prefix: `property-generated/${asString(raw.slug) || doc.id}/`, force: true }),
  ]);

  await db.collection(PROPERTIES_COLLECTION).doc(doc.id).delete();

  return { id: doc.id, slug: asString(raw.slug) || doc.id };
}
