import { randomUUID } from 'crypto';
import fs from 'fs/promises';
import path from 'path';

import { config as loadDotenv } from 'dotenv';
import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';

loadDotenv({ path: '/data/.openclaw/workspace/scripts/.env' });
loadDotenv({ path: '/data/.openclaw/workspace/property-portal/.env.local' });

function initFirebaseAdmin() {
  if (getApps().length) return getApps()[0];

  const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!raw) {
    throw new Error('FIREBASE_SERVICE_ACCOUNT is not configured');
  }

  const serviceAccount = JSON.parse(raw);
  const storageBucket =
    process.env.FIREBASE_STORAGE_BUCKET ||
    process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET ||
    serviceAccount.storage_bucket ||
    (serviceAccount.project_id ? `${serviceAccount.project_id}.appspot.com` : undefined);

  return initializeApp({
    credential: cert(serviceAccount),
    storageBucket,
  });
}

const app = initFirebaseAdmin();
const db = getFirestore(app);
const storage = getStorage(app);
const PROPERTIES_COLLECTION = 'properties';

function parseOptionalNumber(value) {
  const trimmed = String(value ?? '').trim();
  if (!trimmed) return null;
  const number = Number(trimmed);
  return Number.isFinite(number) ? number : null;
}

function visibilityFromTransaction(transactionType) {
  if (transactionType === 'sale') return { transactionLabel: 'For Sale', saleActive: true, leaseActive: false };
  if (transactionType === 'lease') return { transactionLabel: 'For Lease', saleActive: false, leaseActive: true };
  return { transactionLabel: 'For Sale/Lease', saleActive: true, leaseActive: true };
}

async function uploadBufferAsPhoto(slug, filename, contentType, buffer, index, admin = false) {
  const bucket = storage.bucket();
  const safeName = filename.replace(/[^a-zA-Z0-9._-]+/g, '-');
  const storagePath = `property-intake/${slug}/${Date.now()}-${admin ? 'admin-' : ''}${index}-${safeName}`;
  const bucketFile = bucket.file(storagePath);

  await bucketFile.save(buffer, {
    metadata: {
      contentType: contentType || 'application/octet-stream',
      cacheControl: 'public, max-age=31536000',
    },
    resumable: false,
  });

  await bucketFile.makePublic();
  const publicUrl = `https://storage.googleapis.com/${bucket.name}/${storagePath}`;

  return {
    id: randomUUID(),
    title: filename,
    caption: null,
    isPrimary: index === 0,
    sortOrder: index,
    uploadedByUserId: null,
    uploadedAt: new Date().toISOString(),
    urls: {
      original: publicUrl,
      full: publicUrl,
      xlarge: publicUrl,
      large: publicUrl,
      medium: publicUrl,
      thumb: publicUrl,
    },
  };
}

async function main() {
  const slug = `smoke-test-${Date.now()}`;
  const docRef = db.collection(PROPERTIES_COLLECTION).doc(slug);
  const actor = {
    email: 'ryan@piercommercial.com',
    role: 'admin',
    name: 'Ryan T. Schneider',
  };

  const samplePath = '/data/.openclaw/workspace/property-portal/public/vercel.svg';
  const sampleBuffer = await fs.readFile(samplePath);

  console.log('TEST_SLUG', slug);

  // Step 1: simulate intake creation with one uploaded photo
  const intakePayload = {
    slug,
    title: 'Smoke Test Listing',
    transactionType: 'sale',
    propertyType: 'Office',
    addressStreet: '123 Test Street',
    city: 'Savannah',
    state: 'GA',
    zip: '31401',
    county: 'Chatham',
    parcelId: 'SMOKE-TEST',
    listingPriceAmount: '1000000',
    listingPriceVisibility: 'public',
    askingPriceRate: '',
    availableSf: '2500',
    buildingSizeSf: '2500',
    lotSizeAcres: '0.5',
    yearBuilt: '2000',
    zoning: 'B-C',
    leaseType: '',
    websiteUrl: '',
    notes: 'Smoke test description paragraph for intake flow.',
  };

  const intakeImage = await uploadBufferAsPhoto(slug, path.basename(samplePath), 'image/svg+xml', sampleBuffer, 0, false);
  const now = new Date().toISOString();

  await docRef.set({
    slug: intakePayload.slug,
    title: intakePayload.title,
    status: 'draft',
    workflowStatus: 'review',
    ownerUserId: actor.email,
    ownerEmail: actor.email,
    leadBroker: actor.name,
    createdByUserId: actor.email,
    updatedByUserId: actor.email,
    createdAt: now,
    updatedAt: now,
    visibility: visibilityFromTransaction(intakePayload.transactionType),
    address: {
      full: `${intakePayload.addressStreet}, ${intakePayload.city}, ${intakePayload.state} ${intakePayload.zip}`,
      street: intakePayload.addressStreet,
      city: intakePayload.city,
      state: intakePayload.state,
      zip: intakePayload.zip,
      county: intakePayload.county,
      hideAddress: false,
    },
    property: {
      category: intakePayload.propertyType,
      buildingSizeSf: parseOptionalNumber(intakePayload.buildingSizeSf),
      lotSizeAcres: parseOptionalNumber(intakePayload.lotSizeAcres),
      yearBuilt: parseOptionalNumber(intakePayload.yearBuilt),
      zoning: intakePayload.zoning,
      parcelId: intakePayload.parcelId,
    },
    pricing: {
      salePriceDollars: parseOptionalNumber(intakePayload.listingPriceAmount),
      listingPriceVisibility: intakePayload.listingPriceVisibility,
      askingPriceRatePerSf: parseOptionalNumber(intakePayload.askingPriceRate),
      availableSqFt: parseOptionalNumber(intakePayload.availableSf),
    },
    content: {
      saleTitle: intakePayload.title,
      saleDescription: intakePayload.notes,
      leaseDescription: null,
      locationDescription: null,
      exteriorDescription: null,
      saleBullets: [],
      leaseBullets: [],
    },
    media: {
      heroImageUrl: intakeImage.urls.large,
      images: [intakeImage],
      documents: [],
    },
    links: {
      websiteUrl: intakePayload.websiteUrl || null,
    },
    admin: {
      leaseType: intakePayload.leaseType || null,
      propertyTypeLabel: intakePayload.propertyType || null,
      intakeNotes: intakePayload.notes || null,
    },
    meta: {
      intake: {
        property_type: intakePayload.propertyType,
        parcel_id: intakePayload.parcelId,
        listing_price_amount: intakePayload.listingPriceAmount,
        listing_price_visibility: intakePayload.listingPriceVisibility,
        asking_price_rate: intakePayload.askingPriceRate,
        available_sf: intakePayload.availableSf,
        building_size_sf: intakePayload.buildingSizeSf,
        lot_size_acres: intakePayload.lotSizeAcres,
        year_built: intakePayload.yearBuilt,
        zoning: intakePayload.zoning,
        lease_type: intakePayload.leaseType,
        website_url: intakePayload.websiteUrl,
        notes: intakePayload.notes,
        uploaded_photo_count: 1,
      },
      uploadedPhotoNames: [path.basename(samplePath)],
      createdVia: 'broker-intake-v1',
      intakeStatus: 'submitted_with_photos',
    },
  }, { merge: true });

  const afterIntake = (await docRef.get()).data();
  console.log('AFTER_INTAKE', JSON.stringify({
    exists: !!afterIntake,
    status: afterIntake?.status,
    workflowStatus: afterIntake?.workflowStatus,
    heroImageUrl: afterIntake?.media?.heroImageUrl,
    imageCount: Array.isArray(afterIntake?.media?.images) ? afterIntake.media.images.length : 0,
    uploadedPhotoCount: afterIntake?.meta?.intake?.uploaded_photo_count,
  }, null, 2));

  // Step 2: simulate admin media append later
  const appendImage = await uploadBufferAsPhoto(slug, 'extra-' + path.basename(samplePath), 'image/svg+xml', sampleBuffer, 1, true);
  const existingImages = Array.isArray(afterIntake?.media?.images) ? afterIntake.media.images : [];
  const nextImages = [
    ...existingImages,
    { ...appendImage, isPrimary: existingImages.length === 0 },
  ].map((image, index) => ({
    ...image,
    sortOrder: index,
    isPrimary: index === 0 ? true : image.isPrimary === true,
  }));

  await docRef.set({
    media: {
      heroImageUrl: nextImages[0]?.urls?.large ?? nextImages[0]?.urls?.original ?? null,
      images: nextImages,
    },
    updatedByUserId: actor.email,
    updatedAt: new Date().toISOString(),
    meta: {
      uploadedPhotoNames: [...(afterIntake?.meta?.uploadedPhotoNames ?? []), 'extra-' + path.basename(samplePath)],
      adminLastPhotoUploadAt: new Date().toISOString(),
      adminLastPhotoUploadBy: actor.email,
      intake: {
        uploaded_photo_count: nextImages.length,
      },
    },
  }, { merge: true });

  const afterAppend = (await docRef.get()).data();
  console.log('AFTER_APPEND', JSON.stringify({
    heroImageUrl: afterAppend?.media?.heroImageUrl,
    imageCount: Array.isArray(afterAppend?.media?.images) ? afterAppend.media.images.length : 0,
    uploadedPhotoCount: afterAppend?.meta?.intake?.uploaded_photo_count,
    firstImageTitle: afterAppend?.media?.images?.[0]?.title,
    secondImageTitle: afterAppend?.media?.images?.[1]?.title,
  }, null, 2));

  // cleanup
  await docRef.delete();
  console.log('CLEANUP', 'deleted test document', slug);
}

main().catch((error) => {
  console.error('TEST_FAILED', error);
  process.exit(1);
});
