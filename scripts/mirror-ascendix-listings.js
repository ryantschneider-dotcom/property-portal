#!/usr/bin/env node
const { config } = require('dotenv');
const path = require('path');
const fs = require('fs');
const { cert, getApps, initializeApp } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');

config({ path: path.resolve(__dirname, '../../scripts/.env') });
config({ path: path.resolve(__dirname, '../.env.local') });

const SF_CONFIG = JSON.parse(
  fs.readFileSync(path.resolve(__dirname, '../../tools/salesforce_ascendix/config.json'), 'utf8')
);
const API_VERSION = 'v61.0';
const MANUAL_LISTING_ID = 'a0GUQ00000C2SMH2A3';
const MANUAL_DEAL_ID = 'a0AUQ00000Gpev32AB';
const NOW = new Date().toISOString();

function initFirebase() {
  if (getApps().length) return getApps()[0];
  const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
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

function xmlEscape(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

async function sfLogin() {
  const envelope = `<?xml version="1.0" encoding="utf-8" ?>
<env:Envelope xmlns:xsd="http://www.w3.org/2001/XMLSchema"
              xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
              xmlns:env="http://schemas.xmlsoap.org/soap/envelope/">
  <env:Body>
    <n1:login xmlns:n1="urn:partner.soap.sforce.com">
      <n1:username>${xmlEscape(SF_CONFIG.sf_username)}</n1:username>
      <n1:password>${xmlEscape(SF_CONFIG.sf_password + SF_CONFIG.sf_security_token)}</n1:password>
    </n1:login>
  </env:Body>
</env:Envelope>`;

  const response = await fetch(`${SF_CONFIG.sf_login_url}/services/Soap/u/${API_VERSION}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'text/xml; charset=UTF-8',
      SOAPAction: 'login',
    },
    body: envelope,
  });

  const text = await response.text();
  if (!response.ok) throw new Error(`Salesforce login failed: ${response.status} ${text}`);

  const sessionMatch = text.match(/<sessionId>([^<]+)<\/sessionId>/);
  const serverMatch = text.match(/<serverUrl>(https:\/\/[^<]+)<\/serverUrl>/);
  if (!sessionMatch || !serverMatch) throw new Error('Salesforce login missing session/server URL');

  const instanceUrl = serverMatch[1].match(/^(https:\/\/[^/]+)/)[1];
  return { sessionId: sessionMatch[1], instanceUrl };
}

async function sfQuery(auth, soql) {
  const url = new URL(`${auth.instanceUrl}/services/data/${API_VERSION}/query`);
  url.searchParams.set('q', soql);
  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${auth.sessionId}`,
      Accept: 'application/json',
    },
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`Salesforce query failed: ${response.status} ${text}`);
  return JSON.parse(text);
}

function normalizeText(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/\b(st)\b/g, 'street')
    .replace(/\b(ave)\b/g, 'avenue')
    .replace(/\b(rd)\b/g, 'road')
    .replace(/\b(blvd)\b/g, 'boulevard')
    .replace(/\b(dr)\b/g, 'drive')
    .replace(/\b(hwy)\b/g, 'highway')
    .replace(/\b(w)\b/g, 'west')
    .replace(/\b(e)\b/g, 'east')
    .replace(/\b(n)\b/g, 'north')
    .replace(/\b(s)\b/g, 'south')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function normalizeAddress(street, city, state) {
  return [street, city, state].map(normalizeText).filter(Boolean).join(' | ');
}

function slugify(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'listing';
}

function categoryFromUseType(useType) {
  const value = String(useType || '').toLowerCase();
  if (!value) return null;
  if (value.includes('office')) return 'office';
  if (value.includes('retail')) return 'retail';
  if (value.includes('industrial')) return 'industrial';
  if (value.includes('land')) return 'land';
  if (value.includes('multi')) return 'multifamily';
  return value;
}

function transactionConfig(recordTypeName, active) {
  const rt = String(recordTypeName || '').toLowerCase();
  if (rt.includes('sale') && rt.includes('lease')) {
    return { saleActive: active, leaseActive: active, transactionLabel: 'For Sale/Lease' };
  }
  if (rt.includes('sale')) {
    return { saleActive: active, leaseActive: false, transactionLabel: 'For Sale' };
  }
  return { saleActive: false, leaseActive: active, transactionLabel: 'For Lease' };
}

function buildFullAddress(street, city, state, zip) {
  return [street, [city, state].filter(Boolean).join(', '), zip].filter(Boolean).join(' ');
}

async function main() {
  const auth = await sfLogin();
  const listingsSoql = `SELECT Id, Name, RecordType.Name, ascendix__Status__c, ascendix__UseType__c, ascendix__Property__c, ascendix__ListingBrokerContact__r.Name, ascendix__Property__r.ascendix__Street__c, ascendix__Property__r.ascendix__City__c, ascendix__Property__r.ascendix__State__c, ascendix__Property__r.ascendix__PostalCode__c, ascendix__Property__r.ascendix__TotalBuildingArea__c, ascendix__Property__r.ascendix__GLA__c, ascendix__Property__r.ascendix__YearBuilt__c, ascendix__Property__r.ascendix__LandArea__c FROM ascendix__Listing__c WHERE (ascendix__SourceSystem__c = 'Buildout' AND ascendix__Status__c = 'Active') OR Id = '${MANUAL_LISTING_ID}' ORDER BY Name`;
  const dealsSoql = `SELECT Id, Name, RecordType.Name, ascendix__Listing__c, ascendix__Status__c FROM ascendix__Deal__c WHERE (ascendix__SourceSystem__c = 'Buildout' AND ascendix__Status__c = 'Open') OR Id = '${MANUAL_DEAL_ID}'`;

  const listings = (await sfQuery(auth, listingsSoql)).records;
  const deals = (await sfQuery(auth, dealsSoql)).records;
  const dealByListingId = new Map(deals.map((deal) => [deal.ascendix__Listing__c, deal]));

  const db = getFirestore(initFirebase());
  const existingSnapshot = await db.collection('properties').get();
  const existingDocs = existingSnapshot.docs.map((doc) => ({ id: doc.id, data: doc.data() }));
  const byAscendixListingId = new Map();
  const byAddress = new Map();

  for (const doc of existingDocs) {
    const data = doc.data || {};
    const listingId = data?.sourceIds?.ascendixListingId;
    if (listingId) byAscendixListingId.set(listingId, doc);
    const addrKey = normalizeAddress(data?.address?.street, data?.address?.city, data?.address?.state);
    if (addrKey) byAddress.set(addrKey, doc);
  }

  const batch = db.batch();
  const report = [];

  for (const listing of listings) {
    const prop = listing.ascendix__Property__r || {};
    const deal = dealByListingId.get(listing.Id) || null;
    const street = prop.ascendix__Street__c || listing.Name;
    const city = prop.ascendix__City__c || 'Savannah';
    const state = prop.ascendix__State__c || 'GA';
    const zip = prop.ascendix__PostalCode__c || null;
    const addrKey = normalizeAddress(street, city, state);
    const existing = byAscendixListingId.get(listing.Id) || byAddress.get(addrKey) || null;
    const existingData = existing?.data || {};
    const isActive = String(listing.ascendix__Status__c || '').toLowerCase() === 'active';
    const visibility = transactionConfig(listing.RecordType?.Name, isActive);
    const slug = existingData.slug || slugify(street);
    const docId = existing?.id || slug;
    const docRef = db.collection('properties').doc(docId);
    const fullAddress = buildFullAddress(street, city, state, zip);

    const nextDoc = {
      ...existingData,
      slug,
      title: existingData.title || listing.Name || street,
      source: 'Ascendix',
      status: isActive ? 'active' : 'inactive',
      address: {
        countryCode: 'US',
        countryName: 'United States',
        hideAddress: false,
        market: existingData?.address?.market || '',
        submarket: existingData?.address?.submarket || '',
        county: existingData?.address?.county || '',
        crossStreets: existingData?.address?.crossStreets || '',
        street,
        city,
        state,
        zip,
        full: fullAddress,
      },
      visibility: {
        draft: false,
        ...existingData.visibility,
        ...visibility,
      },
      property: {
        category: categoryFromUseType(listing.ascendix__UseType__c) || existingData?.property?.category || null,
        typeId: existingData?.property?.typeId ?? null,
        subtypeId: existingData?.property?.subtypeId ?? null,
        additionalSubtypeIds: existingData?.property?.additionalSubtypeIds || [],
        typeLabelOverride: existingData?.property?.typeLabelOverride || '',
        buildingSizeSf: prop.ascendix__TotalBuildingArea__c ?? existingData?.property?.buildingSizeSf ?? null,
        grossLeasableArea: prop.ascendix__GLA__c ?? existingData?.property?.grossLeasableArea ?? null,
        lotSizeAcres: prop.ascendix__LandArea__c ?? existingData?.property?.lotSizeAcres ?? null,
        yearBuilt: prop.ascendix__YearBuilt__c ? Number(prop.ascendix__YearBuilt__c) : existingData?.property?.yearBuilt ?? null,
        numberOfUnits: existingData?.property?.numberOfUnits ?? null,
        numberOfFloors: existingData?.property?.numberOfFloors ?? null,
        zoning: existingData?.property?.zoning ?? null,
        parcelId: existingData?.property?.parcelId ?? null,
      },
      broker: {
        name: listing.ascendix__ListingBrokerContact__r?.Name || existingData?.broker?.name || 'PIER Commercial Real Estate',
        company: 'PIER Commercial Real Estate',
        role: existingData?.broker?.role || 'Listing Broker',
      },
      sourceIds: {
        ...(existingData.sourceIds || {}),
        ascendixListingId: listing.Id,
        ascendixPropertyId: listing.ascendix__Property__c,
        ascendixDealId: deal?.Id || null,
      },
      content: existingData.content || {
        locationDescription: null,
        siteDescription: null,
        exteriorDescription: null,
        saleTitle: null,
        saleDescription: null,
        saleBullets: [],
        leaseTitle: null,
        leaseDescription: null,
        leaseBullets: [],
      },
      media: existingData.media || {
        heroImageUrl: null,
        images: [],
        documents: [],
      },
      links: existingData.links || {
        saleListingUrl: null,
        leaseListingUrl: null,
        virtualTourUrl: null,
        matterportUrl: null,
        youTubeUrl: null,
        websiteUrl: null,
      },
      location: existingData.location || {
        lat: null,
        lng: null,
      },
      meta: {
        ...(existingData.meta || {}),
        updatedAt: NOW,
        ascendixSyncedAt: NOW,
        ascendixListingStatus: listing.ascendix__Status__c || null,
        ascendixDealStatus: deal?.ascendix__Status__c || null,
        ascendixListingRecordType: listing.RecordType?.Name || null,
        ascendixDealRecordType: deal?.RecordType?.Name || null,
      },
    };

    batch.set(docRef, nextDoc, { merge: true });
    report.push({
      docId,
      listingId: listing.Id,
      dealId: deal?.Id || null,
      address: fullAddress,
      action: existing ? 'updated' : 'created',
      matchedExistingId: existing?.id || null,
    });
  }

  await batch.commit();

  const verifySnapshot = await db.collection('properties').get();
  const syncedDocs = verifySnapshot.docs.filter((doc) => doc.data()?.sourceIds?.ascendixListingId).map((doc) => doc.id);

  console.log(JSON.stringify({
    listingCount: listings.length,
    dealCount: deals.length,
    updated: report.filter((item) => item.action === 'updated').length,
    created: report.filter((item) => item.action === 'created').length,
    syncedDocCount: syncedDocs.length,
    syncedDocIds: syncedDocs.sort(),
    report,
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
