import "server-only";

import { FieldValue } from "firebase-admin/firestore";

import { buildDraftPreviewPath } from "@/lib/draft-preview";
import { appendDraftPreviewToken } from "@/lib/draft-preview-token";
import { db, PROPERTIES_COLLECTION, PUBLIC_LISTINGS_COLLECTION } from "@/lib/firestore";
import { getPropertyBySlug, getPropertyDocumentByIdentifier } from "@/lib/properties";

const LAUNCH_PACKAGE_VERSION = "v2-listingstream";
const LAUNCH_SUMMARY_VERSION = "v2-listingstream";
const MEDIA_MANIFEST_VERSION = "v2-listingstream";

function normalizeString(value: unknown): string | null {
  if (value == null) return null;
  const text = String(value).trim();
  return text || null;
}

type LaunchRecord = Record<string, unknown>;

function asRecord(value: unknown): LaunchRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? value as LaunchRecord : {};
}

function normalizeSpaces(raw: LaunchRecord, property: NonNullable<Awaited<ReturnType<typeof getPropertyBySlug>>>) {
  const rawAvailability = asRecord(raw.availability);
  const rawBuildout = asRecord(asRecord(raw.raw).buildout);
  const candidates = [
    property.spaces,
    raw.spaces,
    raw.suites,
    rawAvailability.spaces,
    rawAvailability.suites,
    rawBuildout.spaces,
    rawBuildout.suites,
    rawBuildout.availabilities,
    rawBuildout.units,
  ].filter(Array.isArray);

  return candidates.flatMap((items) =>
    (items as LaunchRecord[]).map((item) => ({
      id: item.id ?? null,
      name: item.name ?? item.title ?? null,
      suite: item.suite ?? item.unit ?? item.label ?? null,
      sizeSf: item.sizeSf ?? item.availableSqFt ?? item.squareFeet ?? item.sqFt ?? item.size ?? null,
      ratePerSf: item.ratePerSf ?? item.askingPriceRatePerSf ?? item.pricePerSf ?? item.leaseRate ?? null,
      monthlyRate: item.monthlyRate ?? item.monthlyRent ?? item.rentPerMonth ?? null,
      rawRateLabel: item.rawRateLabel ?? item.rateLabel ?? item.priceLabel ?? null,
    })),
  );
}

function hasValidCoordinates(location: { lat: number | null; lng: number | null } | null | undefined) {
  return typeof location?.lat === "number" && Number.isFinite(location.lat)
    && typeof location?.lng === "number" && Number.isFinite(location.lng);
}

function normalizeListingStatus(value: unknown): "active" | "inactive" | "under_contract" | "leased" | "sold" {
  const status = normalizeString(value)?.toLowerCase().replace(/[\s-]+/g, "_");
  if (status === "inactive") return "inactive";
  if (status === "under_contract" || status === "undercontract" || status === "contract_pending" || status === "pending_contract") return "under_contract";
  if (status === "leased") return "leased";
  if (status === "sold") return "sold";
  return "active";
}

async function resolveProperty(identifier: string) {
  const doc = await getPropertyDocumentByIdentifier(identifier);
  if (!doc?.exists) throw new Error("Property not found");

  const raw = (doc.data() as LaunchRecord | undefined) ?? {};
  const slug = normalizeString(raw.slug) || doc.id;
  const property = await getPropertyBySlug(doc.id) ?? await getPropertyBySlug(slug);
  if (!property) throw new Error("Property details not found");

  return { doc, raw, slug, property };
}

function buildLaunchSnapshot(input: {
  documentId: string;
  slug: string;
  raw: LaunchRecord;
  property: Awaited<ReturnType<typeof getPropertyBySlug>> extends infer T ? Exclude<T, null> : never;
}) {
  const { documentId, slug, raw, property } = input;
  const listingStatus = normalizeListingStatus(raw.listingStatus ?? raw.status);
  return {
    documentId,
    slug,
    title: property.title,
    status: listingStatus,
    listingStatus,
    underContract: listingStatus === "under_contract",
    transactionTypes: property.transactionTypes,
    address: property.address,
    location: property.location,
    property: property.property,
    pricing: {
      ...property.pricing,
      availableSqFt: property.pricing.availableSqFt ?? raw.pricing?.availableSqFt ?? null,
      askingPriceRatePerSf: property.pricing.askingPriceRatePerSf ?? raw.pricing?.askingPriceRatePerSf ?? raw.meta?.adminOverrides?.askingPriceRate ?? null,
      leaseType: property.pricing.leaseType ?? raw.meta?.adminOverrides?.leaseType ?? null,
      listingPriceVisibility: property.pricing.listingPriceVisibility ?? raw.pricing?.listingPriceVisibility ?? raw.meta?.adminOverrides?.listingPriceVisibility ?? null,
    },
    content: property.content,
    media: property.media,
    spaces: normalizeSpaces(raw, property),
    links: property.links,
    visibility: raw.visibility ?? null,
    ownerEmail: normalizeString(raw.ownerEmail ?? raw.ownerUserId),
    leadBroker: normalizeString(raw.leadBroker ?? raw.admin?.leadBroker ?? raw.meta?.intake?.lead_broker),
  };
}

export async function persistLaunchExecutionState(identifier: string, actorEmail: string) {
  const { doc, raw, slug, property } = await resolveProperty(identifier);
  const now = new Date().toISOString();
  const hasGeo = hasValidCoordinates(property.location);
  const warningReasons = hasGeo ? [] : ["Missing Geolocation"];
  const readyReasons = [
    "Approval complete",
    "Canonical launch package built",
    ...(hasGeo ? ["Valid geolocation"] : []),
  ];
  const launchSnapshot = buildLaunchSnapshot({
    documentId: doc.id,
    slug,
    raw,
    property,
  });

  await db.collection(PROPERTIES_COLLECTION).doc(doc.id).set(
    {
      meta: {
        updatedAt: FieldValue.serverTimestamp(),
        launchPackage: {
          status: "built",
          builtAt: FieldValue.serverTimestamp(),
          builtBy: actorEmail,
          version: LAUNCH_PACKAGE_VERSION,
          warnings: warningReasons,
          notes: hasGeo
            ? ["Package built and ready for ListingStream publish."]
            : ["Package built, but publish is blocked until geolocation is added."],
          snapshot: launchSnapshot,
        },
        exportWorkflow: {
          status: hasGeo ? "ready" : "warning",
          destination: "listingstream",
          lastEvaluatedAt: FieldValue.serverTimestamp(),
          lastEvaluatedBy: actorEmail,
          readyReasons,
          blockingReasons: [],
          warningReasons,
          packageStatus: "built",
          packageVersion: LAUNCH_PACKAGE_VERSION,
          lastPackagedAt: FieldValue.serverTimestamp(),
          lastPackagedBy: actorEmail,
          lastExportAttempt: raw.meta?.exportWorkflow?.lastExportAttempt ?? {
            attemptedAt: null,
            attemptedBy: null,
            result: null,
            errorMessage: null,
          },
          exportCount: Number(raw.meta?.exportWorkflow?.exportCount ?? 0) || 0,
        },
        exportArtifacts: {
          listingStreamPayloadVersion: LAUNCH_SUMMARY_VERSION,
          launchSummaryVersion: LAUNCH_SUMMARY_VERSION,
          mediaManifestVersion: MEDIA_MANIFEST_VERSION,
          packageBuiltAt: now,
        },
        export: {
          buildoutReady: hasGeo,
          missingRequiredFields: hasGeo ? [] : ["location.lat", "location.lng"],
          warnings: warningReasons,
        },
      },
    },
    { merge: true },
  );

  return {
    documentId: doc.id,
    slug,
    launchPackageStatus: "built",
    exportWorkflowStatus: hasGeo ? "ready" : "warning",
    listingstreamReady: hasGeo,
    warningReasons,
    readyReasons,
    snapshot: launchSnapshot,
  };
}


function buildListingStreamPayload(input: {
  documentId: string;
  slug: string;
  snapshot: ReturnType<typeof buildLaunchSnapshot>;
  actorEmail: string;
  publishStatus: "draft" | "published";
  existingPublishedAt?: unknown;
}) {
  const now = new Date().toISOString();
  return {
    sourceDocumentId: input.documentId,
    slug: input.slug,
    title: input.snapshot.title,
    status: input.snapshot.status,
    listingStatus: input.snapshot.listingStatus,
    underContract: input.snapshot.underContract,
    transactionTypes: input.snapshot.transactionTypes,
    address: input.snapshot.address,
    location: input.snapshot.location,
    property: input.snapshot.property,
    pricing: input.snapshot.pricing,
    content: input.snapshot.content,
    media: input.snapshot.media,
    links: input.snapshot.links,
    spaces: input.snapshot.spaces,
    visibility: input.snapshot.visibility,
    ownerEmail: input.snapshot.ownerEmail,
    leadBroker: input.snapshot.leadBroker,
    publishStatus: input.publishStatus,
    publishedAt: input.publishStatus === "published" ? (input.existingPublishedAt ?? now) : null,
    publishedBy: input.publishStatus === "published" ? input.actorEmail : null,
    draftPreviewUrl: appendDraftPreviewToken(buildDraftPreviewPath(input.slug), input.slug),
    updatedAt: now,
  };
}

export async function saveDraftLaunchPackageToListingStream(identifier: string, actorEmail: string) {
  const packageState = await persistLaunchExecutionState(identifier, actorEmail);
  const { doc, raw, slug } = await resolveProperty(identifier);
  const snapshot = packageState.snapshot;
  const publicPayload = buildListingStreamPayload({ documentId: doc.id, slug, snapshot, actorEmail, publishStatus: "draft" });

  await db.collection(PUBLIC_LISTINGS_COLLECTION).doc(doc.id).set(publicPayload, { merge: true });
  await db.collection(PROPERTIES_COLLECTION).doc(doc.id).set(
    {
      status: "draft",
      listingStatus: snapshot.listingStatus,
      underContract: snapshot.underContract,
      workflowStatus: "draft_preview",
      meta: {
        updatedAt: FieldValue.serverTimestamp(),
        exportWorkflow: {
          status: "draft_preview",
          destination: "listingstream",
          readyReasons: packageState.readyReasons,
          blockingReasons: [],
          warningReasons: packageState.warningReasons,
          packageStatus: "built",
          packageVersion: LAUNCH_PACKAGE_VERSION,
          draftSavedAt: FieldValue.serverTimestamp(),
          draftSavedBy: actorEmail,
          lastExportAttempt: {
            attemptedAt: FieldValue.serverTimestamp(),
            attemptedBy: actorEmail,
            result: "draft",
            errorMessage: null,
          },
          exportCount: Number(raw.meta?.exportWorkflow?.exportCount ?? 0) || 0,
        },
      },
    },
    { merge: true },
  );

  return {
    documentId: doc.id,
    slug,
    destination: "listingstream",
    publishStatus: "draft",
    publicCollection: PUBLIC_LISTINGS_COLLECTION,
    previewUrl: appendDraftPreviewToken(buildDraftPreviewPath(slug), slug),
    ascendixBypassed: true,
  };
}

export async function makeDraftLaunchPackageLive(identifier: string, actorEmail: string) {
  const packageState = await persistLaunchExecutionState(identifier, actorEmail);
  const { doc, raw, slug } = await resolveProperty(identifier);
  const snapshot = packageState.snapshot;
  const publicPayload = buildListingStreamPayload({ documentId: doc.id, slug, snapshot, actorEmail, publishStatus: "published", existingPublishedAt: raw.publishedAt });
  await db.collection(PUBLIC_LISTINGS_COLLECTION).doc(doc.id).set(publicPayload, { merge: true });
  await db.collection(PROPERTIES_COLLECTION).doc(doc.id).set(
    {
      status: snapshot.status,
      listingStatus: snapshot.listingStatus,
      underContract: snapshot.underContract,
      workflowStatus: "approved",
      meta: {
        updatedAt: FieldValue.serverTimestamp(),
        exportWorkflow: {
          status: "completed",
          destination: "listingstream",
          readyReasons: packageState.readyReasons,
          blockingReasons: [],
          warningReasons: packageState.warningReasons,
          packageStatus: "built",
          packageVersion: LAUNCH_PACKAGE_VERSION,
          publishedAt: FieldValue.serverTimestamp(),
          publishedBy: actorEmail,
          lastExportAttempt: {
            attemptedAt: FieldValue.serverTimestamp(),
            attemptedBy: actorEmail,
            result: "published",
            errorMessage: null,
          },
          exportCount: (Number(raw.meta?.exportWorkflow?.exportCount ?? 0) || 0) + 1,
        },
      },
    },
    { merge: true },
  );
  return { documentId: doc.id, slug, destination: "listingstream", publishStatus: "published", publicCollection: PUBLIC_LISTINGS_COLLECTION };
}

export async function deleteDraftLaunchPackage(identifier: string) {
  const { doc, slug, raw } = await resolveProperty(identifier);
  const publishStatus = raw.status || raw.workflowStatus || raw.meta?.exportWorkflow?.status;
  if (!["draft", "draft_preview"].includes(String(publishStatus))) {
    throw new Error("Only draft preview listings can be deleted from this endpoint.");
  }
  await Promise.all([
    db.collection(PUBLIC_LISTINGS_COLLECTION).doc(doc.id).delete(),
    db.collection(PROPERTIES_COLLECTION).doc(doc.id).delete(),
  ]);
  return { documentId: doc.id, slug, publishStatus: "deleted" };
}

export async function publishLaunchPackageToListingStream(identifier: string, actorEmail: string) {
  const packageState = await persistLaunchExecutionState(identifier, actorEmail);
  const { doc, raw, slug } = await resolveProperty(identifier);
  const snapshot = packageState.snapshot;
  const now = new Date().toISOString();
  const exportCountBase = Number(raw.meta?.exportWorkflow?.exportCount ?? 0) || 0;

  if (!hasValidCoordinates(snapshot.location)) {
    await db.collection(PROPERTIES_COLLECTION).doc(doc.id).set(
      {
        meta: {
          updatedAt: FieldValue.serverTimestamp(),
          exportWorkflow: {
            status: "failed",
            destination: "listingstream",
            blockingReasons: ["Missing Geolocation"],
            warningReasons: ["Missing Geolocation"],
            packageStatus: "built",
            packageVersion: LAUNCH_PACKAGE_VERSION,
            lastExportAttempt: {
              attemptedAt: FieldValue.serverTimestamp(),
              attemptedBy: actorEmail,
              result: "failed",
              errorMessage: "Missing Geolocation",
            },
            exportCount: exportCountBase,
          },
        },
      },
      { merge: true },
    );

    throw new Error("Missing Geolocation");
  }

  const publicPayload = buildListingStreamPayload({ documentId: doc.id, slug, snapshot, actorEmail, publishStatus: "published", existingPublishedAt: now });

  await db.collection(PUBLIC_LISTINGS_COLLECTION).doc(doc.id).set(publicPayload, { merge: true });

  await db.collection(PROPERTIES_COLLECTION).doc(doc.id).set(
    {
      status: snapshot.status,
      listingStatus: snapshot.listingStatus,
      underContract: snapshot.underContract,
      meta: {
        updatedAt: FieldValue.serverTimestamp(),
        exportWorkflow: {
          status: "completed",
          destination: "listingstream",
          readyReasons: packageState.readyReasons,
          blockingReasons: [],
          warningReasons: packageState.warningReasons,
          packageStatus: "built",
          packageVersion: LAUNCH_PACKAGE_VERSION,
          publishedAt: FieldValue.serverTimestamp(),
          publishedBy: actorEmail,
          lastExportAttempt: {
            attemptedAt: FieldValue.serverTimestamp(),
            attemptedBy: actorEmail,
            result: "published",
            errorMessage: null,
          },
          exportCount: exportCountBase + 1,
        },
      },
    },
    { merge: true },
  );

  return {
    documentId: doc.id,
    slug,
    destination: "listingstream",
    publishStatus: "published",
    publicCollection: PUBLIC_LISTINGS_COLLECTION,
  };
}
