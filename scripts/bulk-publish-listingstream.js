require('dotenv').config({ path: '/data/.openclaw/workspace/scripts/.env' });
require('dotenv').config({ path: '/data/.openclaw/workspace/property-portal/.env.local' });

const { cert, getApps, initializeApp } = require('firebase-admin/app');
const { FieldValue, getFirestore } = require('firebase-admin/firestore');

const PROPERTIES_COLLECTION = 'properties';
const PUBLIC_LISTINGS_COLLECTION = 'public_listings';
const LAUNCH_PACKAGE_VERSION = 'v2-listingstream';
const LAUNCH_SUMMARY_VERSION = 'v2-listingstream';
const MEDIA_MANIFEST_VERSION = 'v2-listingstream';
const ACTOR_EMAIL = process.env.LISTINGSTREAM_BULK_PUBLISH_ACTOR || 'mac@openclaw.local';

function initDb() {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!raw) throw new Error('FIREBASE_SERVICE_ACCOUNT is not configured');
  const app = getApps().length ? getApps()[0] : initializeApp({ credential: cert(JSON.parse(raw)) });
  return getFirestore(app);
}

function normalizeString(value) {
  if (value == null) return null;
  const text = String(value).trim();
  return text || null;
}

function hasValidCoordinates(location) {
  return Number.isFinite(location?.lat) && Number.isFinite(location?.lng);
}

function normalizeSpaces(raw = {}) {
  const candidates = [
    raw.spaces,
    raw.suites,
    raw.availability?.spaces,
    raw.availability?.suites,
    raw.raw?.buildout?.spaces,
    raw.raw?.buildout?.suites,
    raw.raw?.buildout?.availabilities,
    raw.raw?.buildout?.units,
  ].filter(Array.isArray);

  return candidates.flatMap((items) => items.map((item) => ({
    id: item?.id ?? null,
    name: item?.name ?? item?.title ?? null,
    suite: item?.suite ?? item?.unit ?? item?.label ?? null,
    sizeSf: item?.sizeSf ?? item?.availableSqFt ?? item?.squareFeet ?? item?.sqFt ?? item?.size ?? null,
    ratePerSf: item?.ratePerSf ?? item?.askingPriceRatePerSf ?? item?.pricePerSf ?? item?.leaseRate ?? null,
    monthlyRate: item?.monthlyRate ?? item?.monthlyRent ?? item?.rentPerMonth ?? null,
    rawRateLabel: item?.rawRateLabel ?? item?.rateLabel ?? item?.priceLabel ?? null,
  })));
}

function normalizeTransactionTypes(visibility = {}) {
  const label = visibility?.transactionLabel;
  if (label === 'For Sale') return ['sale'];
  if (label === 'For Lease') return ['lease'];
  if (label === 'For Sale/Lease') return ['sale', 'lease'];
  if (visibility.saleActive === true && visibility.leaseActive === true) return ['sale', 'lease'];
  if (visibility.saleActive === true) return ['sale'];
  if (visibility.leaseActive === true) return ['lease'];
  return [];
}

function buildPropertyDetailLike(docId, raw) {
  const address = raw.address || {};
  const location = raw.location || {};
  const property = raw.property || {};
  const pricing = raw.pricing || {};
  const content = raw.content || {};
  const media = raw.media || {};
  const links = raw.links || {};

  return {
    id: docId,
    slug: normalizeString(raw.slug) || docId,
    title: normalizeString(raw.title) || 'Untitled Property',
    transactionTypes: normalizeTransactionTypes(raw.visibility || {}),
    address: {
      full: address.full ?? null,
      street: address.street ?? null,
      city: address.city ?? null,
      state: address.state ?? null,
      zip: address.zip ?? null,
      county: address.county ?? null,
      market: address.market ?? null,
      submarket: address.submarket ?? null,
      crossStreets: address.crossStreets ?? null,
      hideAddress: address.hideAddress === true,
    },
    location: {
      lat: Number.isFinite(location.lat) ? location.lat : null,
      lng: Number.isFinite(location.lng) ? location.lng : null,
    },
    property: {
      category: property.category ?? null,
      typeId: property.typeId ?? null,
      subtypeId: property.subtypeId ?? null,
      buildingSizeSf: property.buildingSizeSf ?? null,
      grossLeasableArea: property.grossLeasableArea ?? null,
      lotSizeAcres: property.lotSizeAcres ?? null,
      yearBuilt: property.yearBuilt ?? null,
      numberOfUnits: property.numberOfUnits ?? null,
      numberOfFloors: property.numberOfFloors ?? null,
      zoning: property.zoning ?? null,
      parcelId: property.parcelId ?? null,
    },
    pricing: {
      hideSalePrice: pricing.hideSalePrice === true,
      hiddenPriceLabel: pricing.hiddenPriceLabel ?? null,
      salePriceDollars: pricing.salePriceDollars ?? null,
      salePricePerUnit: pricing.salePricePerUnit ?? null,
      salePriceUnits: pricing.salePriceUnits ?? null,
      availableSqFt: pricing.availableSqFt ?? raw.meta?.adminOverrides?.availableSf ?? null,
      askingPriceRatePerSf: pricing.askingPriceRatePerSf ?? raw.meta?.adminOverrides?.askingPriceRate ?? null,
      leaseType: raw.meta?.adminOverrides?.leaseType ?? null,
      listingPriceVisibility: pricing.listingPriceVisibility ?? raw.meta?.adminOverrides?.listingPriceVisibility ?? null,
    },
    content: {
      locationDescription: content.locationDescription ?? null,
      siteDescription: content.siteDescription ?? null,
      exteriorDescription: content.exteriorDescription ?? null,
      saleTitle: content.saleTitle ?? null,
      saleDescription: content.saleDescription ?? null,
      saleBullets: Array.isArray(content.saleBullets) ? content.saleBullets : [],
      leaseTitle: content.leaseTitle ?? null,
      leaseDescription: content.leaseDescription ?? null,
      leaseBullets: Array.isArray(content.leaseBullets) ? content.leaseBullets : [],
    },
    media: {
      heroImageUrl: media.heroImageUrl ?? null,
      images: Array.isArray(media.images) ? media.images : [],
      documents: Array.isArray(media.documents) ? media.documents : [],
    },
    links: {
      saleListingUrl: links.saleListingUrl ?? null,
      leaseListingUrl: links.leaseListingUrl ?? null,
      virtualTourUrl: links.virtualTourUrl ?? null,
      matterportUrl: links.matterportUrl ?? null,
      youTubeUrl: links.youTubeUrl ?? null,
      websiteUrl: links.websiteUrl ?? null,
    },
    spaces: normalizeSpaces(raw),
  };
}

function buildLaunchSnapshot(docId, raw) {
  const property = buildPropertyDetailLike(docId, raw);
  return {
    documentId: docId,
    slug: property.slug,
    title: property.title,
    transactionTypes: property.transactionTypes,
    address: property.address,
    location: property.location,
    property: property.property,
    pricing: property.pricing,
    content: property.content,
    media: property.media,
    links: property.links,
    spaces: property.spaces,
    visibility: raw.visibility ?? null,
    ownerEmail: normalizeString(raw.ownerEmail ?? raw.ownerUserId),
    leadBroker: normalizeString(raw.leadBroker ?? raw.admin?.leadBroker ?? raw.meta?.intake?.lead_broker),
  };
}

async function publishOne(db, doc) {
  const raw = doc.data() || {};
  const nowIso = new Date().toISOString();
  const launchSnapshot = buildLaunchSnapshot(doc.id, raw);
  const hasGeo = hasValidCoordinates(launchSnapshot.location);
  const warningReasons = hasGeo ? [] : ['Missing Geolocation'];
  const readyReasons = ['Approval complete', 'Canonical launch package built', ...(hasGeo ? ['Valid geolocation'] : [])];
  const exportCountBase = Number(raw.meta?.exportWorkflow?.exportCount ?? 0) || 0;

  if (!hasGeo) {
    await db.collection(PROPERTIES_COLLECTION).doc(doc.id).set({
      meta: {
        updatedAt: FieldValue.serverTimestamp(),
        launchPackage: {
          status: 'built',
          builtAt: FieldValue.serverTimestamp(),
          builtBy: ACTOR_EMAIL,
          version: LAUNCH_PACKAGE_VERSION,
          warnings: warningReasons,
          notes: ['Package built, but publish is blocked until geolocation is added.'],
          snapshot: launchSnapshot,
        },
        exportWorkflow: {
          status: 'failed',
          destination: 'listingstream',
          lastEvaluatedAt: FieldValue.serverTimestamp(),
          lastEvaluatedBy: ACTOR_EMAIL,
          readyReasons,
          blockingReasons: ['Missing Geolocation'],
          warningReasons,
          packageStatus: 'built',
          packageVersion: LAUNCH_PACKAGE_VERSION,
          lastPackagedAt: FieldValue.serverTimestamp(),
          lastPackagedBy: ACTOR_EMAIL,
          lastExportAttempt: {
            attemptedAt: FieldValue.serverTimestamp(),
            attemptedBy: ACTOR_EMAIL,
            result: 'failed',
            errorMessage: 'Missing Geolocation',
          },
          exportCount: exportCountBase,
        },
      },
    }, { merge: true });
    return { status: 'failed', reason: 'Missing Geolocation' };
  }

  const publicPayload = {
    sourceDocumentId: doc.id,
    slug: launchSnapshot.slug,
    title: launchSnapshot.title,
    transactionTypes: launchSnapshot.transactionTypes,
    address: launchSnapshot.address,
    location: launchSnapshot.location,
    property: launchSnapshot.property,
    pricing: launchSnapshot.pricing,
    content: launchSnapshot.content,
    media: launchSnapshot.media,
    links: launchSnapshot.links,
    spaces: launchSnapshot.spaces,
    visibility: launchSnapshot.visibility,
    ownerEmail: launchSnapshot.ownerEmail,
    leadBroker: launchSnapshot.leadBroker,
    publishStatus: 'published',
    publishedAt: nowIso,
    publishedBy: ACTOR_EMAIL,
    updatedAt: nowIso,
  };

  await db.collection(PUBLIC_LISTINGS_COLLECTION).doc(doc.id).set(publicPayload, { merge: true });

  await db.collection(PROPERTIES_COLLECTION).doc(doc.id).set({
    workflowStatus: 'approved',
    meta: {
      updatedAt: FieldValue.serverTimestamp(),
      approval: {
        status: 'approved',
        approvedAt: FieldValue.serverTimestamp(),
        approvedBy: ACTOR_EMAIL,
      },
      launchPackage: {
        status: 'built',
        builtAt: FieldValue.serverTimestamp(),
        builtBy: ACTOR_EMAIL,
        version: LAUNCH_PACKAGE_VERSION,
        warnings: [],
        notes: ['Package built and published to ListingStream by bulk migration.'],
        snapshot: launchSnapshot,
      },
      exportWorkflow: {
        status: 'completed',
        destination: 'listingstream',
        lastEvaluatedAt: FieldValue.serverTimestamp(),
        lastEvaluatedBy: ACTOR_EMAIL,
        readyReasons,
        blockingReasons: [],
        warningReasons: [],
        packageStatus: 'built',
        packageVersion: LAUNCH_PACKAGE_VERSION,
        lastPackagedAt: FieldValue.serverTimestamp(),
        lastPackagedBy: ACTOR_EMAIL,
        publishedAt: FieldValue.serverTimestamp(),
        publishedBy: ACTOR_EMAIL,
        lastExportAttempt: {
          attemptedAt: FieldValue.serverTimestamp(),
          attemptedBy: ACTOR_EMAIL,
          result: 'published',
          errorMessage: null,
        },
        exportCount: exportCountBase + 1,
      },
      exportArtifacts: {
        listingStreamPayloadVersion: LAUNCH_SUMMARY_VERSION,
        launchSummaryVersion: LAUNCH_SUMMARY_VERSION,
        mediaManifestVersion: MEDIA_MANIFEST_VERSION,
        packageBuiltAt: nowIso,
      },
      export: {
        buildoutReady: true,
        missingRequiredFields: [],
        warnings: [],
      },
    },
  }, { merge: true });

  return { status: 'published', publicPayload };
}

async function main() {
  const db = initDb();
  const snapshot = await db.collection(PROPERTIES_COLLECTION).get();
  const candidates = snapshot.docs.filter((doc) => {
    const data = doc.data() || {};
    return data.status === 'active' && hasValidCoordinates(data.location || {});
  });

  const results = {
    totalProperties: snapshot.size,
    candidateCount: candidates.length,
    published: 0,
    failed: 0,
    skipped: snapshot.size - candidates.length,
    failures: [],
    publishedIds: [],
  };

  for (const doc of candidates) {
    try {
      const result = await publishOne(db, doc);
      if (result.status === 'published') {
        results.published += 1;
        results.publishedIds.push(doc.id);
      } else {
        results.failed += 1;
        results.failures.push({ id: doc.id, reason: result.reason || 'Unknown failure' });
      }
    } catch (error) {
      results.failed += 1;
      results.failures.push({ id: doc.id, reason: error instanceof Error ? error.message : String(error) });
    }
  }

  const publicSnap = await db.collection(PUBLIC_LISTINGS_COLLECTION).get();
  const sourceCompletedSnap = await db.collection(PROPERTIES_COLLECTION)
    .where('meta.exportWorkflow.destination', '==', 'listingstream')
    .where('meta.exportWorkflow.status', '==', 'completed')
    .get();

  const verification = {
    publicListingsCount: publicSnap.size,
    sourceCompletedCount: sourceCompletedSnap.size,
    publicIdsMissingFromThisRun: publicSnap.docs.map((doc) => doc.id).filter((id) => !results.publishedIds.includes(id)),
  };

  console.log(JSON.stringify({ results, verification }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
