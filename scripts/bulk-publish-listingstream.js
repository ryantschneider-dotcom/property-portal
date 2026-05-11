require('dotenv').config({ path: '/data/.openclaw/workspace/scripts/.env' });
require('dotenv').config({ path: '/data/.openclaw/workspace/property-portal/.env.local' });

const http = require('http');
const https = require('https');

const { cert, getApps, initializeApp } = require('firebase-admin/app');
const { FieldValue, getFirestore } = require('firebase-admin/firestore');

const PROPERTIES_COLLECTION = 'properties';
const PUBLIC_LISTINGS_COLLECTION = 'public_listings';
const LAUNCH_PACKAGE_VERSION = 'v2-listingstream';
const LAUNCH_SUMMARY_VERSION = 'v2-listingstream';
const MEDIA_MANIFEST_VERSION = 'v2-listingstream';
const ACTOR_EMAIL = process.env.LISTINGSTREAM_BULK_PUBLISH_ACTOR || 'mac@openclaw.local';
const BUILDOUT_API_KEY = (process.env.BUILDOUT_API_KEY || '').trim();
const BUILDOUT_BASE_URL = (process.env.BUILDOUT_BASE_URL || 'https://buildout.com/api/v1').replace(/\/$/, '');
const buildoutDetailCache = new Map();
const buildoutPublicEmbedCache = new Map();
const buildoutPluginHtmlCache = new Map();

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

function requestText(url, redirectCount = 0) {
  return new Promise((resolve, reject) => {
    const client = String(url).startsWith('http://') ? http : https;
    client.get(url, { headers: { Accept: '*/*', 'User-Agent': 'Mozilla/5.0' } }, (response) => {
      if (response.statusCode && response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
        if (redirectCount >= 5) {
          reject(new Error('Too many redirects'));
          return;
        }
        const nextUrl = new URL(response.headers.location, url).toString();
        response.resume();
        requestText(nextUrl, redirectCount + 1).then(resolve).catch(reject);
        return;
      }

      let body = '';
      response.on('data', (chunk) => {
        body += chunk;
      });
      response.on('end', () => {
        if (response.statusCode && response.statusCode >= 400) {
          reject(new Error(`Buildout request failed (${response.statusCode})`));
          return;
        }
        resolve(body);
      });
    }).on('error', reject);
  });
}

function requestJson(url) {
  return requestText(url).then((body) => {
    try {
      return body ? JSON.parse(body) : {};
    } catch (error) {
      throw error;
    }
  });
}

async function fetchBuildoutPropertyDetail(raw = {}) {
  const buildoutId = raw?.raw?.buildout?.id;
  if (!BUILDOUT_API_KEY || !buildoutId) return null;
  if (buildoutDetailCache.has(buildoutId)) return buildoutDetailCache.get(buildoutId);

  const url = `${BUILDOUT_BASE_URL}/${BUILDOUT_API_KEY}/properties/${buildoutId}.json`;
  const promise = requestJson(url)
    .then((payload) => payload?.property || payload || null)
    .catch(() => null);

  buildoutDetailCache.set(buildoutId, promise);
  return promise;
}

function decodeHtmlEntities(value) {
  if (!value) return '';
  return String(value)
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

function stripHtml(value) {
  return decodeHtmlEntities(String(value || ''))
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function slugifyMetricLabel(value) {
  return stripHtml(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function pickPublicListingUrl(raw = {}) {
  return normalizeString(raw.links?.leaseListingUrl || raw.links?.saleListingUrl || raw.links?.websiteUrl);
}

async function fetchBuildoutPublicEmbed(raw = {}) {
  const listingUrl = pickPublicListingUrl(raw);
  if (!listingUrl) return null;
  if (buildoutPublicEmbedCache.has(listingUrl)) return buildoutPublicEmbedCache.get(listingUrl);

  const promise = requestText(listingUrl).then((html) => {
    const tokenMatch = html.match(/BuildOut\.embed\(\{[\s\S]*?token:\s*"([^"]+)"/i);
    const pluginMatch = html.match(/BuildOut\.embed\(\{[\s\S]*?plugin:\s*"([^"]+)"/i);
    const parsedUrl = new URL(listingUrl);
    const propertyId = parsedUrl.searchParams.get('propertyId') || null;
    if (!tokenMatch || !propertyId) return null;
    return {
      token: tokenMatch[1],
      plugin: pluginMatch ? pluginMatch[1] : 'inventory',
      host: parsedUrl.hostname,
      propertyId,
      listingUrl,
    };
  }).catch(() => null);

  buildoutPublicEmbedCache.set(listingUrl, promise);
  return promise;
}

async function fetchBuildoutPluginHtml(raw = {}) {
  const embed = await fetchBuildoutPublicEmbed(raw);
  if (!embed || embed.plugin !== 'inventory') return null;
  const cacheKey = `${embed.token}:${embed.host}:${embed.propertyId}`;
  if (buildoutPluginHtmlCache.has(cacheKey)) return buildoutPluginHtmlCache.get(cacheKey);

  const url = `https://buildout.com/plugins/${embed.token}/${embed.host}/inventory/${embed.propertyId}?iframe=true&embedded=true&cacheSearch=true`;
  const promise = requestText(url).catch(() => null);
  buildoutPluginHtmlCache.set(cacheKey, promise);
  return promise;
}


function parseDemographicsFromPluginHtml(html) {
  if (!html || !/Demographics Map & Report/i.test(html)) return null;
  const sectionMatch = html.match(/<div[^>]*class="[^"]*demographics[^"]*"[\s\S]*?<table[^>]*class="table"[^>]*>[\s\S]*?<\/table>/i);
  const tableMatch = (sectionMatch ? sectionMatch[0] : html).match(/<table[^>]*class="table"[^>]*>[\s\S]*?<\/table>/i);
  if (!tableMatch) return null;
  const tableHtml = tableMatch[0];

  const headerMatches = [...tableHtml.matchAll(/<th[^>]*scope="col"[^>]*>([\s\S]*?)<\/th>/gi)]
    .map((match) => stripHtml(match[1]));
  const radiusHeaders = headerMatches.slice(1).filter(Boolean);
  if (!radiusHeaders.length) return null;

  const rings = {};
  radiusHeaders.forEach((header) => {
    const radiusValue = Number.parseFloat(header);
    const ringKey =
      radiusValue == 1 ? 'oneMile'
      : radiusValue == 3 ? 'threeMile'
      : radiusValue == 5 ? 'fiveMile'
      : null;
    if (ringKey) rings[ringKey] = {};
  });

  if (!Object.keys(rings).length) return null;

  const rowMatches = [...tableHtml.matchAll(/<tr>([\s\S]*?)<\/tr>/gi)];
  for (const rowMatch of rowMatches) {
    const cells = [...rowMatch[1].matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi)].map((match) => stripHtml(match[1]));
    if (cells.length !== radiusHeaders.length + 1) continue;
    const metricKey = slugifyMetricLabel(cells[0]);
    if (!metricKey) continue;
    radiusHeaders.forEach((header, index) => {
      const radiusValue = Number.parseFloat(header);
      const ringKey =
        radiusValue == 1 ? 'oneMile'
        : radiusValue == 3 ? 'threeMile'
        : radiusValue == 5 ? 'fiveMile'
        : null;
      if (!ringKey) return;
      rings[ringKey][metricKey] = cells[index + 1] || null;
    });
  }

  return Object.values(rings).some((ring) => ring && Object.keys(ring).length) ? rings : null;
}

function parseSquareFeet(value) {
  const normalized = normalizeString(value);
  if (!normalized) return null;
  const cleaned = normalized.replace(/,/g, '').match(/-?\d+(?:\.\d+)?/);
  return cleaned ? Number(cleaned[0]) : null;
}

function parseRateLabel(value) {
  const normalized = normalizeString(value);
  if (!normalized) return { rawRateLabel: null, ratePerSf: null };
  const match = normalized.replace(/,/g, '').match(/\$?\s*(-?\d+(?:\.\d+)?)/);
  return {
    rawRateLabel: normalized,
    ratePerSf: match ? Number(match[1]) : null,
  };
}

function parseSpacesFromPluginHtml(html) {
  if (!html || !/leaseSpacesTable/i.test(html)) return [];
  const tableMatch = html.match(/<table[^>]*id="leaseSpacesTable-[^"]*"[^>]*>[\s\S]*?<\/table>/i);
  if (!tableMatch) return [];
  const tableHtml = tableMatch[0];
  const rowMatches = [...tableHtml.matchAll(/<tr[^>]*class="[^"]*js-lease-space-row-toggle[^"]*"[^>]*>([\s\S]*?)<\/tr>/gi)];
  return rowMatches.map((rowMatch, index) => {
    const cells = [...rowMatch[1].matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi)].map((match) => stripHtml(match[1]));
    const name = cells[0] || null;
    const spaceType = cells[1] || null;
    const sizeLabel = cells[2] || null;
    const rateLabel = cells[3] || null;
    const rate = parseRateLabel(rateLabel);
    return {
      id: `plugin-space-${index}`,
      name,
      suite: null,
      spaceType,
      sizeSf: parseSquareFeet(sizeLabel),
      ratePerSf: rate.ratePerSf,
      monthlyRate: null,
      rawRateLabel: rate.rawRateLabel,
      leaseTerm: cells[4] || null,
    };
  }).filter((item) => item.name || item.sizeSf || item.rawRateLabel);
}

function normalizeDocuments(raw = {}, detail = {}) {
  const documents = [];
  const seen = new Set();
  const pushDocument = (item) => {
    if (!item) return;
    const url = normalizeString(item.url || item.href || item.link);
    if (!url || seen.has(url)) return;
    seen.add(url);
    documents.push({
      id: item.id ?? url,
      title: normalizeString(item.title || item.name || item.label || item.filename) || 'Document',
      description: normalizeString(item.description),
      documentType: normalizeString(item.documentType || item.type || item.category),
      url,
      filename: normalizeString(item.filename || item.original_file_name || item.name),
      contentType: normalizeString(item.contentType || item.mimeType),
      source: normalizeString(item.source) || 'Buildout',
      isExternal: /^https?:\/\//i.test(url),
    });
  };

  const candidates = [
    ...(Array.isArray(raw.media?.documents) ? raw.media.documents : []),
    ...(Array.isArray(raw.documents) ? raw.documents : []),
    ...(Array.isArray(raw.raw?.buildout?.documents) ? raw.raw.buildout.documents : []),
    ...(Array.isArray(detail?.documents) ? detail.documents : []),
  ];

  candidates.forEach(pushDocument);

  [
    { title: 'Property Website', url: raw.links?.websiteUrl, documentType: 'External Link', source: 'Website' },
    { title: 'Sale Listing', url: raw.links?.saleListingUrl, documentType: 'External Link', source: 'Website' },
    { title: 'Lease Listing', url: raw.links?.leaseListingUrl, documentType: 'External Link', source: 'Website' },
  ].forEach(pushDocument);

  return documents;
}

async function normalizeDemographics(raw = {}, detail = null) {
  const source =
    raw.demographics ||
    raw.marketData?.demographics ||
    raw.raw?.buildout?.demographics ||
    detail?.demographics ||
    null;

  const rings = {
    oneMile: source?.oneMile || source?.one_mile || detail?.oneMile || detail?.one_mile || null,
    threeMile: source?.threeMile || source?.three_mile || detail?.threeMile || detail?.three_mile || null,
    fiveMile: source?.fiveMile || source?.five_mile || detail?.fiveMile || detail?.five_mile || null,
  };

  if (Object.values(rings).some(Boolean)) return rings;

  const pluginHtml = await fetchBuildoutPluginHtml(raw);
  return parseDemographicsFromPluginHtml(pluginHtml);
}

function normalizeBrokerProfile(raw = {}) {
  const broker = raw.broker || {};
  return {
    name: normalizeString(raw.leadBroker || raw.meta?.adminOverrides?.leadBroker || broker.name),
    title: normalizeString(broker.role),
    company: normalizeString(broker.company),
    designations: Array.isArray(raw.brokerProfile?.designations) ? raw.brokerProfile.designations.filter(Boolean) : [],
    licenseNumber: normalizeString(raw.brokerProfile?.licenseNumber),
    phone: normalizeString(raw.brokerProfile?.phone || raw.contact?.phone),
    email: normalizeString(raw.brokerProfile?.email || raw.ownerEmail),
    headshotUrl: normalizeString(raw.brokerProfile?.headshotUrl || raw.brokerProfile?.photoUrl),
  };
}

async function normalizeSpaces(raw = {}) {
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

  const normalized = candidates.flatMap((items) => items.map((item) => ({
    id: item?.id ?? null,
    name: item?.name ?? item?.title ?? null,
    suite: item?.suite ?? item?.unit ?? item?.label ?? null,
    spaceType: item?.spaceType ?? item?.space_type ?? item?.type ?? null,
    sizeSf: item?.sizeSf ?? item?.availableSqFt ?? item?.squareFeet ?? item?.sqFt ?? item?.size ?? null,
    ratePerSf: item?.ratePerSf ?? item?.askingPriceRatePerSf ?? item?.pricePerSf ?? item?.leaseRate ?? null,
    monthlyRate: item?.monthlyRate ?? item?.monthlyRent ?? item?.rentPerMonth ?? null,
    rawRateLabel: item?.rawRateLabel ?? item?.rateLabel ?? item?.priceLabel ?? null,
    leaseTerm: item?.leaseTerm ?? item?.lease_term ?? null,
  })));

  if (normalized.length) return normalized;

  const pluginHtml = await fetchBuildoutPluginHtml(raw);
  return parseSpacesFromPluginHtml(pluginHtml);
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

async function buildPropertyDetailLike(docId, raw, detail = null) {
  const address = raw.address || {};
  const location = raw.location || {};
  const property = raw.property || {};
  const pricing = raw.pricing || {};
  const content = raw.content || {};
  const media = raw.media || {};
  const links = raw.links || {};
  const demographics = await normalizeDemographics(raw, detail);

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
      documents: normalizeDocuments(raw, detail),
    },
    links: {
      saleListingUrl: links.saleListingUrl ?? null,
      leaseListingUrl: links.leaseListingUrl ?? null,
      virtualTourUrl: links.virtualTourUrl ?? null,
      matterportUrl: links.matterportUrl ?? null,
      youTubeUrl: links.youTubeUrl ?? null,
      websiteUrl: links.websiteUrl ?? null,
    },
    spaces: await normalizeSpaces(raw),
    documents: normalizeDocuments(raw, detail),
    demographics,
    brokerProfile: normalizeBrokerProfile(raw),
  };
}

async function buildLaunchSnapshot(docId, raw, detail = null) {
  const property = await buildPropertyDetailLike(docId, raw, detail);
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
    documents: property.documents,
    demographics: property.demographics,
    brokerProfile: property.brokerProfile,
    visibility: raw.visibility ?? null,
    ownerEmail: normalizeString(raw.ownerEmail ?? raw.ownerUserId),
    leadBroker: normalizeString(raw.leadBroker ?? raw.admin?.leadBroker ?? raw.meta?.intake?.lead_broker),
  };
}

async function publishOne(db, doc) {
  const raw = doc.data() || {};
  const nowIso = new Date().toISOString();
  const buildoutDetail = await fetchBuildoutPropertyDetail(raw);
  const launchSnapshot = await buildLaunchSnapshot(doc.id, raw, buildoutDetail);
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
    documents: launchSnapshot.documents,
    demographics: launchSnapshot.demographics,
    brokerProfile: launchSnapshot.brokerProfile,
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
