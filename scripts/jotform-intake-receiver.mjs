import http from 'node:http';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { config as loadDotenv } from 'dotenv';
import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const portalRoot = path.resolve(__dirname, '..');

loadDotenv({ path: '/data/.openclaw/workspace/scripts/.env' });
loadDotenv({ path: path.join(portalRoot, '.env.local') });

const PORT = Number(process.env.LISTINGSTREAM_JOTFORM_PORT || 8788);
const MEDIA_VAULT_ROOT = process.env.LISTINGSTREAM_MEDIA_VAULT || '/Volumes/ListingsMedia/ListingStream_Media';
const HIGH_RES_DIR = path.join(MEDIA_VAULT_ROOT, 'HighRes_Photos');
const JOTFORM_SHARED_SECRET = process.env.JOTFORM_WEBHOOK_SECRET || '';
const PROPERTIES_COLLECTION = 'properties';

function initFirebaseAdmin() {
  if (getApps().length) return getApps()[0];
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!raw) {
    throw new Error('FIREBASE_SERVICE_ACCOUNT is not configured');
  }

  const serviceAccount = JSON.parse(raw);
  return initializeApp({
    credential: cert(serviceAccount),
  });
}

const app = initFirebaseAdmin();
const db = getFirestore(app);

function json(res, status, payload) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(payload, null, 2));
}

function slugify(value) {
  return String(value || '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || `listing-${Date.now()}`;
}

function normalizeKey(value) {
  return String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, '');
}

function asText(value) {
  if (value == null) return '';
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (Array.isArray(value)) return value.map(asText).filter(Boolean).join(', ');
  if (typeof value === 'object') {
    const obj = value;
    const bits = ['full', 'address', 'addr_line1', 'street', 'city', 'state', 'postal', 'zip']
      .map((key) => asText(obj[key]))
      .filter(Boolean);
    return bits.join(', ');
  }
  return '';
}

function parseOptionalNumber(value) {
  const cleaned = String(value ?? '').replace(/[$,%]/g, '').replace(/,/g, '').trim();
  if (!cleaned) return null;
  const number = Number(cleaned);
  return Number.isFinite(number) ? number : null;
}

function visibilityFromTransaction(transactionType) {
  if (transactionType === 'sale') return { transactionLabel: 'For Sale', saleActive: true, leaseActive: false };
  if (transactionType === 'lease') return { transactionLabel: 'For Lease', saleActive: false, leaseActive: true };
  return { transactionLabel: 'For Sale/Lease', saleActive: true, leaseActive: true };
}

function detectTransactionType(value) {
  const text = String(value || '').toLowerCase();
  if (text.includes('sale') && text.includes('lease')) return 'sale-lease';
  if (text.includes('lease')) return 'lease';
  if (text.includes('sale')) return 'sale';
  return 'sale';
}

function collectAnswerMap(payload) {
  const answerMap = new Map();
  const sources = [];
  if (payload?.answers && typeof payload.answers === 'object') sources.push(payload.answers);
  if (payload?.pretty && typeof payload.pretty === 'object') sources.push(payload.pretty);
  if (payload?.rawRequest && typeof payload.rawRequest === 'object') sources.push(payload.rawRequest);
  if (payload && typeof payload === 'object') sources.push(payload);

  for (const source of sources) {
    for (const [key, raw] of Object.entries(source)) {
      if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
        const text = asText(raw.answer ?? raw.prettyFormat ?? raw.text ?? raw.value ?? raw);
        if (text) answerMap.set(normalizeKey(raw.name || raw.text || key), text);
        if (text) answerMap.set(normalizeKey(key), text);
        if (raw.name) answerMap.set(normalizeKey(raw.name), text);
        if (raw.text) answerMap.set(normalizeKey(raw.text), text);
      } else {
        const text = asText(raw);
        if (text) answerMap.set(normalizeKey(key), text);
      }
    }
  }

  return answerMap;
}

function pick(answerMap, ...keys) {
  for (const key of keys) {
    const value = answerMap.get(normalizeKey(key));
    if (value) return value;
  }
  return '';
}

function collectImageUrls(payload) {
  const found = new Set();
  const visit = (value) => {
    if (!value) return;
    if (typeof value === 'string') {
      for (const part of value.split(/[\s,]+/)) {
        const candidate = part.trim();
        if (/^https?:\/\//i.test(candidate) && /(jpg|jpeg|png|gif|webp|heic|heif)(\?|$)/i.test(candidate)) {
          found.add(candidate);
        }
      }
      return;
    }
    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }
    if (typeof value === 'object') {
      Object.values(value).forEach(visit);
    }
  };
  visit(payload);
  return [...found];
}

function inferExtension(url, contentType) {
  const fromUrl = path.extname(new URL(url).pathname).replace('.', '').toLowerCase();
  if (fromUrl) return fromUrl;
  const map = {
    'image/jpeg': 'jpg',
    'image/jpg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
    'image/gif': 'gif',
    'image/heic': 'heic',
    'image/heif': 'heif',
  };
  return map[String(contentType || '').toLowerCase()] || 'bin';
}

async function downloadImageToVault(url, slug, index) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to download image (${response.status}) ${url}`);
  }
  const contentType = response.headers.get('content-type') || 'application/octet-stream';
  const ext = inferExtension(url, contentType);
  const buffer = Buffer.from(await response.arrayBuffer());
  const datedDir = path.join(HIGH_RES_DIR, slug);
  await fs.mkdir(datedDir, { recursive: true });
  const filename = `${Date.now()}-${index + 1}.${ext}`;
  const absolutePath = path.join(datedDir, filename);
  await fs.writeFile(absolutePath, buffer);
  return {
    id: randomUUID(),
    sourceUrl: url,
    absolutePath,
    filename,
    contentType,
    bytes: buffer.length,
    downloadedAt: new Date().toISOString(),
  };
}

function buildListing(payload) {
  const answerMap = collectAnswerMap(payload);
  const addressStreet = pick(answerMap, 'address', 'propertyaddress', 'addressstreet', 'streetaddress', 'addrline1');
  const city = pick(answerMap, 'city');
  const state = pick(answerMap, 'state');
  const zip = pick(answerMap, 'zip', 'zipcode', 'postal', 'postalcode');
  const county = pick(answerMap, 'county');
  const parcelId = pick(answerMap, 'parcelid', 'taxid', 'mapid', 'taxidmapid');
  const propertyType = pick(answerMap, 'propertytype', 'type');
  const description = pick(answerMap, 'description', 'propertydescription', 'notes');
  const transactionType = detectTransactionType(pick(answerMap, 'transactiontype', 'listingtype'));
  const listingPriceAmount = pick(answerMap, 'price', 'listingprice', 'listingpriceamount', 'saleprice');
  const askingPriceRate = pick(answerMap, 'askingpricerate', 'leaserate', 'askingpriceleaseratepersf');
  const availableSf = pick(answerMap, 'availablesf', 'availablesqft', 'availablesquarefeet');
  const buildingSizeSf = pick(answerMap, 'buildingsizesf', 'buildingsize', 'grossbuildingarea');
  const lotSizeAcres = pick(answerMap, 'lotsizeacres', 'lotsize');
  const yearBuilt = pick(answerMap, 'yearbuilt');
  const zoning = pick(answerMap, 'zoning');
  const leaseType = pick(answerMap, 'leasetype');
  const websiteUrl = pick(answerMap, 'websiteurl');
  const title = pick(answerMap, 'title', 'listingtitle') || addressStreet || 'Untitled Listing';
  const slug = slugify(`${addressStreet || title}-${Date.now()}`);

  return {
    slug,
    title,
    transactionType,
    propertyType,
    addressStreet,
    city,
    state: state || 'GA',
    zip,
    county,
    parcelId,
    listingPriceAmount,
    askingPriceRate,
    availableSf,
    buildingSizeSf,
    lotSizeAcres,
    yearBuilt,
    zoning,
    leaseType,
    websiteUrl,
    description,
    rawAnswers: Object.fromEntries(answerMap.entries()),
  };
}

async function createFirestoreDraft(listing, downloadedImages, payload) {
  const now = new Date().toISOString();
  await db.collection(PROPERTIES_COLLECTION).doc(listing.slug).set({
    slug: listing.slug,
    title: listing.title,
    status: 'draft',
    workflowStatus: downloadedImages.length ? 'review' : 'needs_input',
    ownerUserId: 'jotform-webhook',
    ownerEmail: 'jotform-webhook@local',
    leadBroker: pickBrokerName(payload),
    createdByUserId: 'jotform-webhook',
    updatedByUserId: 'jotform-webhook',
    createdAt: now,
    updatedAt: now,
    visibility: visibilityFromTransaction(listing.transactionType),
    address: {
      full: [listing.addressStreet, [listing.city, listing.state].filter(Boolean).join(', '), listing.zip].filter(Boolean).join(' '),
      street: listing.addressStreet || null,
      city: listing.city || null,
      state: listing.state || null,
      zip: listing.zip || null,
      county: listing.county || null,
      hideAddress: false,
    },
    property: {
      category: listing.propertyType || null,
      buildingSizeSf: parseOptionalNumber(listing.buildingSizeSf),
      lotSizeAcres: parseOptionalNumber(listing.lotSizeAcres),
      yearBuilt: parseOptionalNumber(listing.yearBuilt),
      zoning: listing.zoning || null,
      parcelId: listing.parcelId || null,
    },
    pricing: {
      salePriceDollars: parseOptionalNumber(listing.listingPriceAmount),
      askingPriceRatePerSf: parseOptionalNumber(listing.askingPriceRate),
      availableSqFt: parseOptionalNumber(listing.availableSf),
    },
    content: {
      saleTitle: listing.title,
      saleDescription: listing.description || null,
      leaseDescription: listing.description || null,
      locationDescription: null,
      exteriorDescription: null,
      saleBullets: [],
      leaseBullets: [],
    },
    media: {
      heroImageUrl: null,
      images: [],
      documents: [],
      localVaultFiles: downloadedImages,
    },
    links: {
      websiteUrl: listing.websiteUrl || null,
    },
    admin: {
      leaseType: listing.leaseType || null,
      propertyTypeLabel: listing.propertyType || null,
      intakeNotes: listing.description || null,
    },
    meta: {
      intake: {
        source: 'jotform-webhook',
        listing_price_amount: listing.listingPriceAmount || null,
        asking_price_rate: listing.askingPriceRate || null,
        available_sf: listing.availableSf || null,
        building_size_sf: listing.buildingSizeSf || null,
        lot_size_acres: listing.lotSizeAcres || null,
        year_built: listing.yearBuilt || null,
        zoning: listing.zoning || null,
        lease_type: listing.leaseType || null,
        website_url: listing.websiteUrl || null,
        notes: listing.description || null,
        uploaded_photo_count: downloadedImages.length,
      },
      mediaVault: {
        root: MEDIA_VAULT_ROOT,
        highResDir: path.join(HIGH_RES_DIR, listing.slug),
        files: downloadedImages,
      },
      uploadedPhotoNames: downloadedImages.map((item) => item.filename),
      createdVia: 'jotform-webhook-v1',
      intakeStatus: downloadedImages.length ? 'submitted_with_photos' : 'submitted_no_photos',
      jotform: {
        submissionId: asText(payload?.submissionID || payload?.submission_id),
        formId: asText(payload?.formID || payload?.form_id),
        rawAnswers: listing.rawAnswers,
      },
    },
  }, { merge: true });
}

function pickBrokerName(payload) {
  const answerMap = collectAnswerMap(payload);
  return pick(answerMap, 'leadbroker', 'broker', 'submittedby') || 'Jotform Intake';
}

async function parseJsonBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString('utf8');
  return raw ? JSON.parse(raw) : {};
}

function verifySecret(req) {
  if (!JOTFORM_SHARED_SECRET) return true;
  const bearer = req.headers.authorization?.replace(/^Bearer\s+/i, '') || '';
  const header = req.headers['x-jotform-secret'] || req.headers['x-listingstream-secret'] || '';
  return bearer === JOTFORM_SHARED_SECRET || header === JOTFORM_SHARED_SECRET;
}

const server = http.createServer(async (req, res) => {
  try {
    if (req.method === 'GET' && req.url === '/health') {
      return json(res, 200, {
        ok: true,
        service: 'jotform-intake-receiver',
        port: PORT,
        mediaVaultRoot: MEDIA_VAULT_ROOT,
      });
    }

    if (req.method !== 'POST' || !req.url?.startsWith('/webhook/jotform')) {
      return json(res, 404, { error: 'Not found' });
    }

    if (!verifySecret(req)) {
      return json(res, 401, { error: 'Unauthorized webhook request' });
    }

    await fs.mkdir(HIGH_RES_DIR, { recursive: true });

    const payload = await parseJsonBody(req);
    const listing = buildListing(payload);
    if (!listing.addressStreet || !listing.city || !listing.state) {
      return json(res, 400, { error: 'Missing required address fields in Jotform payload' });
    }

    const imageUrls = collectImageUrls(payload);
    const downloadedImages = [];
    for (const [index, url] of imageUrls.entries()) {
      downloadedImages.push(await downloadImageToVault(url, listing.slug, index));
    }

    await createFirestoreDraft(listing, downloadedImages, payload);

    return json(res, 200, {
      ok: true,
      slug: listing.slug,
      port: PORT,
      imageCount: downloadedImages.length,
      mediaVaultPaths: downloadedImages.map((item) => item.absolutePath),
      firestoreCollection: PROPERTIES_COLLECTION,
    });
  } catch (error) {
    console.error('[jotform-intake-receiver] error', error);
    return json(res, 500, {
      error: error instanceof Error ? error.message : 'Webhook receiver failed',
    });
  }
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`[jotform-intake-receiver] listening on http://0.0.0.0:${PORT}`);
  console.log(`[jotform-intake-receiver] media vault root: ${MEDIA_VAULT_ROOT}`);
});
