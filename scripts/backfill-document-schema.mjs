import { config as loadDotenv } from 'dotenv';
import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';

loadDotenv({ path: '/data/.openclaw/workspace/scripts/.env' });
loadDotenv({ path: '.env.local' });

const PROPERTIES_COLLECTION = 'properties';
const DEFAULT_SOURCE = 'buildout_import';

function initDb() {
  if (getApps().length) return getFirestore(getApps()[0]);
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!raw) throw new Error('FIREBASE_SERVICE_ACCOUNT is not configured');
  const app = initializeApp({ credential: cert(JSON.parse(raw)) });
  return getFirestore(app);
}

const db = initDb();

function parseArgs(argv) {
  const args = {
    propertyId: '',
    all: false,
    dryRun: false,
    limit: null,
  };

  for (const arg of argv) {
    if (arg.startsWith('--property=')) args.propertyId = arg.split('=')[1] ?? '';
    else if (arg === '--all') args.all = true;
    else if (arg === '--dry-run') args.dryRun = true;
    else if (arg.startsWith('--limit=')) {
      const n = Number(arg.split('=')[1]);
      args.limit = Number.isFinite(n) && n > 0 ? n : null;
    }
  }

  if (!args.propertyId && !args.all) {
    throw new Error('Usage: node scripts/backfill-document-schema.mjs --property=<id> [--dry-run] OR --all [--dry-run] [--limit=N]');
  }

  return args;
}

function asString(value) {
  if (value == null) return null;
  const text = String(value).trim();
  return text || null;
}

function inferDocumentExtension(filename, contentType) {
  const file = asString(filename);
  if (file && file.includes('.')) {
    return file.split('.').pop().toLowerCase() || null;
  }
  const type = asString(contentType)?.toLowerCase();
  if (!type) return null;
  if (type.includes('pdf')) return 'pdf';
  if (type.includes('jpeg')) return 'jpg';
  if (type.includes('png')) return 'png';
  if (type.includes('gif')) return 'gif';
  if (type.includes('webp')) return 'webp';
  if (type.includes('msword')) return 'doc';
  if (type.includes('wordprocessingml')) return 'docx';
  return null;
}

function inferDocumentKind(title, filename, documentType) {
  const haystack = [title, filename, documentType].map((value) => asString(value)?.toLowerCase() || '').join(' ');
  if (/offering memorandum|\bom\b/.test(haystack)) return 'offering_memorandum';
  if (/floor.?plan/.test(haystack)) return 'floor_plan';
  if (/site.?plan/.test(haystack)) return 'site_plan';
  if (/survey/.test(haystack)) return 'survey';
  if (/brochure|flyer/.test(haystack)) return 'brochure';
  if (/financial/.test(haystack)) return 'financials';
  if (/rent.?roll/.test(haystack)) return 'rent_roll';
  if (/presentation|deck/.test(haystack)) return 'presentation';
  if (/environment/.test(haystack)) return 'environmental';
  if (/title/.test(haystack)) return 'title_document';
  return 'other';
}

function inferImageKind(image, index) {
  if (image?.kind) return image.kind;
  if (image?.isPrimary === true || index === 0) return 'hero';
  const title = asString(image?.title)?.toLowerCase() || '';
  if (/site\s*plan/.test(title)) return 'site_plan_image';
  if (/floor\s*plan/.test(title)) return 'floorplan_image';
  return 'photo';
}

function inferSource(record) {
  if (record?.source) return record.source;
  const path = asString(record?.path || record?.storagePath)?.toLowerCase() || '';
  const uploadedBy = asString(record?.uploadedByUserId || record?.uploadedBy)?.toLowerCase() || '';
  if (path.includes('property-intake') || uploadedBy) return 'broker_upload';
  if (path.includes('generated')) return 'generated';
  if (path.includes('internal')) return 'internal_upload';
  return DEFAULT_SOURCE;
}

function normalizeImage(image, index) {
  const urls = image?.urls || {};
  const original = asString(urls.original) || asString(urls.full) || asString(urls.xlarge) || asString(urls.large) || asString(urls.medium) || asString(urls.thumb);
  const filename = asString(image?.filename) || (original ? original.split('/').pop()?.split('?')[0] || null : null);
  return {
    id: image?.id ?? null,
    kind: inferImageKind(image, index),
    title: asString(image?.title),
    caption: asString(image?.caption),
    isPrimary: image?.isPrimary === true || index === 0,
    sortOrder: Number.isFinite(image?.sortOrder) ? image.sortOrder : index,
    storagePath: asString(image?.storagePath || image?.path),
    urls: {
      original,
      full: asString(urls.full) || original,
      xlarge: asString(urls.xlarge) || null,
      large: asString(urls.large) || original,
      medium: asString(urls.medium) || original,
      thumb: asString(urls.thumb) || asString(urls.medium) || original,
    },
    contentType: asString(image?.contentType),
    filename,
    sizeBytes: Number.isFinite(image?.sizeBytes) ? image.sizeBytes : null,
    width: Number.isFinite(image?.width) ? image.width : null,
    height: Number.isFinite(image?.height) ? image.height : null,
    isPublic: image?.isPublic === true || Boolean(original),
    source: inferSource(image),
    createdAt: asString(image?.createdAt || image?.uploadedAt),
    updatedAt: asString(image?.updatedAt || image?.uploadedAt),
  };
}

function normalizeDocument(document, index) {
  const filename = asString(document?.filename) || asString(document?.title)?.replace(/\s+/g, '-').toLowerCase() || null;
  const contentType = asString(document?.contentType);
  return {
    id: document?.id ?? null,
    title: asString(document?.title),
    description: asString(document?.description),
    documentType: asString(document?.documentType),
    kind: inferDocumentKind(document?.title, filename, document?.documentType),
    subcategory: asString(document?.subcategory),
    storagePath: asString(document?.storagePath || document?.path),
    gsUrl: asString(document?.gsUrl),
    url: asString(document?.url),
    previewImageUrl: asString(document?.previewImageUrl),
    filename,
    contentType,
    extension: inferDocumentExtension(filename, contentType),
    sizeBytes: Number.isFinite(document?.sizeBytes) ? document.sizeBytes : null,
    source: inferSource(document),
    sourceRef: asString(document?.sourceRef),
    isPublic: document?.isPublic === true || /^https?:\/\//i.test(asString(document?.url) || ''),
    status: asString(document?.status) || 'published',
    version: Number.isFinite(document?.version) && document.version > 0 ? document.version : 1,
    sortOrder: Number.isFinite(document?.sortOrder) ? document.sortOrder : index,
    createdAt: asString(document?.createdAt),
    updatedAt: asString(document?.updatedAt),
  };
}

function defaultOmState(existingOm = {}) {
  return {
    status: asString(existingOm.status) || 'queued',
    template: asString(existingOm.template),
    currentDraftDocumentId: asString(existingOm.currentDraftDocumentId),
    currentPublishedDocumentId: asString(existingOm.currentPublishedDocumentId),
    lastGeneratedAt: asString(existingOm.lastGeneratedAt),
    approvedAt: asString(existingOm.approvedAt),
    publishedAt: asString(existingOm.publishedAt),
    error: asString(existingOm.error),
    warnings: Array.isArray(existingOm.warnings) ? existingOm.warnings.filter(Boolean).map(String) : [],
    narrativeSnapshotPath: asString(existingOm.narrativeSnapshotPath),
    inputSnapshotPath: asString(existingOm.inputSnapshotPath),
  };
}

function defaultEnrichmentStatus(existing = {}) {
  const demographics = existing.demographics || {};
  const omInput = existing.omInput || {};
  return {
    demographics: {
      status: asString(demographics.status) || 'pending',
      lastAttemptAt: asString(demographics.lastAttemptAt),
      lastSuccessAt: asString(demographics.lastSuccessAt),
      error: asString(demographics.error),
    },
    omInput: {
      status: asString(omInput.status) || 'pending',
      lastBuiltAt: asString(omInput.lastBuiltAt),
      error: asString(omInput.error),
    },
  };
}

function stableStringify(value) {
  return JSON.stringify(value, Object.keys(value).sort());
}

function changed(a, b) {
  return JSON.stringify(a) !== JSON.stringify(b);
}

async function collectSnapshots({ propertyId, all, limit }) {
  if (propertyId) {
    const snapshot = await db.collection(PROPERTIES_COLLECTION).doc(propertyId).get();
    if (!snapshot.exists) throw new Error(`Property not found: ${propertyId}`);
    return [snapshot];
  }

  let query = db.collection(PROPERTIES_COLLECTION);
  if (limit) query = query.limit(limit);
  const snapshot = await query.get();
  return snapshot.docs;
}

async function backfillPropertyDocuments(snapshot, { dryRun }) {
  const data = snapshot.data() || {};
  const media = data.media || {};
  const existingImages = Array.isArray(media.images) ? media.images : [];
  const existingDocuments = Array.isArray(media.documents) ? media.documents : [];

  const nextImages = existingImages.map(normalizeImage).map((image, index) => ({
    ...image,
    isPrimary: index === 0,
    sortOrder: index,
  }));

  const nextDocuments = existingDocuments.map(normalizeDocument).map((document, index) => ({
    ...document,
    sortOrder: index,
  }));

  const nextOm = defaultOmState(data.om || {});
  const nextEnrichment = defaultEnrichmentStatus(data.enrichment || {});

  const patch = {};
  const changes = [];

  if (changed(existingImages, nextImages)) {
    patch.media = {
      ...(media || {}),
      heroImageUrl: asString(media.heroImageUrl) || nextImages[0]?.urls?.large || nextImages[0]?.urls?.original || null,
      images: nextImages,
      documents: changed(existingDocuments, nextDocuments) ? nextDocuments : existingDocuments,
    };
    changes.push(`media.images(${existingImages.length} -> ${nextImages.length})`);
  } else if (changed(existingDocuments, nextDocuments)) {
    patch.media = {
      ...(media || {}),
      heroImageUrl: asString(media.heroImageUrl) || nextImages[0]?.urls?.large || nextImages[0]?.urls?.original || null,
      images: existingImages,
      documents: nextDocuments,
    };
    changes.push(`media.documents(${existingDocuments.length} -> ${nextDocuments.length})`);
  }

  if (changed(data.om || {}, nextOm)) {
    patch.om = nextOm;
    changes.push('om');
  }

  if (changed(data.enrichment || {}, nextEnrichment)) {
    patch.enrichment = nextEnrichment;
    changes.push('enrichment');
  }

  if (!changes.length) {
    return { propertyId: snapshot.id, updated: false, dryRun, changes: [] };
  }

  patch.meta = {
    ...(data.meta || {}),
    schemaBackfill: {
      mediaV2AppliedAt: dryRun ? asString(data.meta?.schemaBackfill?.mediaV2AppliedAt) : FieldValue.serverTimestamp(),
      mediaV2Version: '2026-05-12',
    },
  };

  if (!dryRun) {
    await snapshot.ref.set(patch, { merge: true });
  }

  return {
    propertyId: snapshot.id,
    updated: true,
    dryRun,
    changes,
    imageCount: nextImages.length,
    documentCount: nextDocuments.length,
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const snapshots = await collectSnapshots(args);
  const results = [];

  for (const snapshot of snapshots) {
    results.push(await backfillPropertyDocuments(snapshot, { dryRun: args.dryRun }));
  }

  const summary = {
    mode: args.dryRun ? 'dry-run' : 'write',
    processed: results.length,
    updated: results.filter((item) => item.updated).length,
    skipped: results.filter((item) => !item.updated).length,
    results,
  };

  console.log(JSON.stringify(summary, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack || error.message : error);
  process.exit(1);
});
