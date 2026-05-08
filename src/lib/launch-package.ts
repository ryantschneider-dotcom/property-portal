import "server-only";

import { FieldValue } from "firebase-admin/firestore";

import { persistBuildoutExportPreview } from "@/lib/buildout-export";
import { db, PROPERTIES_COLLECTION } from "@/lib/firestore";

const LAUNCH_PACKAGE_VERSION = "v1";
const LAUNCH_SUMMARY_VERSION = "v1";
const MEDIA_MANIFEST_VERSION = "v1";

export async function persistLaunchExecutionState(slug: string, actorEmail: string) {
  const buildout = await persistBuildoutExportPreview(slug, actorEmail);
  const query = await db.collection(PROPERTIES_COLLECTION).where("slug", "==", slug).limit(1).get();
  const doc = !query.empty ? query.docs[0] : await db.collection(PROPERTIES_COLLECTION).doc(slug).get();
  if (!doc.exists) throw new Error("Property not found");

  const raw = (doc.data() as Record<string, any> | undefined) ?? {};
  const now = new Date().toISOString();
  const launchPackageStatus = "built" as const;
  const exportWorkflowStatus = buildout.ready ? "export_ready" : "packaged";

  const launchSnapshot = {
    slug: buildout.payload.slug,
    title: buildout.payload.title,
    transactionType: buildout.payload.transactionType,
    address: buildout.payload.address,
    pricing: buildout.payload.pricing,
    media: buildout.payload.media,
    content: {
      saleTitle: buildout.payload.content.saleTitle,
      saleDescription: buildout.payload.content.saleDescription,
      leaseDescription: buildout.payload.content.leaseDescription,
      locationDescription: buildout.payload.content.locationDescription,
      exteriorDescription: buildout.payload.content.exteriorDescription,
      saleBullets: buildout.payload.content.saleBullets,
      leaseBullets: buildout.payload.content.leaseBullets,
    },
    broker: buildout.payload.broker,
    suites: buildout.payload.suites,
  };

  const launchWarnings = Array.from(new Set([
    ...buildout.preflightBlockers.map((item) => `Preflight blocker: ${item}`),
    ...buildout.warnings,
  ]));

  await db.collection(PROPERTIES_COLLECTION).doc(doc.id).set(
    {
      meta: {
        updatedAt: FieldValue.serverTimestamp(),
        launchPackage: {
          status: launchPackageStatus,
          builtAt: FieldValue.serverTimestamp(),
          builtBy: actorEmail,
          version: LAUNCH_PACKAGE_VERSION,
          warnings: launchWarnings,
          notes: buildout.ready
            ? ["Package built and export-ready."]
            : ["Package built, but export still has readiness gaps."],
          snapshot: launchSnapshot,
        },
        exportWorkflow: {
          status: exportWorkflowStatus,
          destination: "buildout",
          lastEvaluatedAt: FieldValue.serverTimestamp(),
          lastEvaluatedBy: actorEmail,
          readyReasons: buildout.ready ? ["Buildout payload validated", "Approval complete", "Canonical launch package built"] : [],
          blockingReasons: buildout.preflightBlockers,
          warningReasons: buildout.warnings,
          packageStatus: launchPackageStatus,
          packageVersion: LAUNCH_PACKAGE_VERSION,
          lastPackagedAt: FieldValue.serverTimestamp(),
          lastPackagedBy: actorEmail,
          lastExportAttempt: {
            attemptedAt: null,
            attemptedBy: null,
            result: null,
            errorMessage: null,
          },
          exportCount: Number(raw.meta?.exportWorkflow?.exportCount ?? 0) || 0,
        },
        exportArtifacts: {
          buildoutPayloadVersion: buildout.payload.fieldMapVersion,
          launchSummaryVersion: LAUNCH_SUMMARY_VERSION,
          mediaManifestVersion: MEDIA_MANIFEST_VERSION,
          packageBuiltAt: now,
        },
      },
    },
    { merge: true },
  );

  return {
    launchPackageStatus,
    exportWorkflowStatus,
    buildoutReady: buildout.ready,
    buildoutMissingFields: buildout.missingRequiredFields,
    buildoutWarnings: buildout.warnings,
    launchWarnings,
  };
}
