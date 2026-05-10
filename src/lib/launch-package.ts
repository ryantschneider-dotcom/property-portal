import "server-only";

import { FieldValue } from "firebase-admin/firestore";

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

function hasValidCoordinates(location: { lat: number | null; lng: number | null } | null | undefined) {
  return typeof location?.lat === "number" && Number.isFinite(location.lat)
    && typeof location?.lng === "number" && Number.isFinite(location.lng);
}

async function resolveProperty(identifier: string) {
  const doc = await getPropertyDocumentByIdentifier(identifier);
  if (!doc?.exists) throw new Error("Property not found");

  const raw = (doc.data() as Record<string, any> | undefined) ?? {};
  const slug = normalizeString(raw.slug) || doc.id;
  const property = await getPropertyBySlug(doc.id) ?? await getPropertyBySlug(slug);
  if (!property) throw new Error("Property details not found");

  return { doc, raw, slug, property };
}

function buildLaunchSnapshot(input: {
  documentId: string;
  slug: string;
  raw: Record<string, any>;
  property: Awaited<ReturnType<typeof getPropertyBySlug>> extends infer T ? Exclude<T, null> : never;
}) {
  const { documentId, slug, raw, property } = input;
  return {
    documentId,
    slug,
    title: property.title,
    transactionTypes: property.transactionTypes,
    address: property.address,
    location: property.location,
    property: property.property,
    pricing: property.pricing,
    content: property.content,
    media: property.media,
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

  const publicPayload = {
    sourceDocumentId: doc.id,
    slug,
    title: snapshot.title,
    transactionTypes: snapshot.transactionTypes,
    address: snapshot.address,
    location: snapshot.location,
    property: snapshot.property,
    pricing: snapshot.pricing,
    content: snapshot.content,
    media: snapshot.media,
    links: snapshot.links,
    visibility: snapshot.visibility,
    ownerEmail: snapshot.ownerEmail,
    leadBroker: snapshot.leadBroker,
    publishStatus: "published",
    publishedAt: now,
    publishedBy: actorEmail,
    updatedAt: now,
  };

  await db.collection(PUBLIC_LISTINGS_COLLECTION).doc(doc.id).set(publicPayload, { merge: true });

  await db.collection(PROPERTIES_COLLECTION).doc(doc.id).set(
    {
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
