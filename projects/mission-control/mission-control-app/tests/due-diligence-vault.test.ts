import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("PIER Manager exposes Due Diligence Vault approval queue and approve action", async () => {
  const source = await readFile("src/components/pier-manager-listing-console.tsx", "utf8");

  assert.match(source, /Due Diligence Vault Queue/);
  assert.match(source, /vaultRequests/);
  assert.match(source, /\/api\/listingstream\/due-diligence-requests/);
  assert.match(source, /Approve Vault Key/);
  assert.match(source, /7-day Vault Key/);
  assert.match(source, /accessUrl/);
  assert.match(source, /Secure Vault Document Upload/);
  assert.match(source, /Document Description/);
  assert.match(source, /type=\"file\"/);
  assert.match(source, /vaultDocumentFile/);
  assert.match(source, /\/api\/listingstream\/vault-documents\/upload/);
});

test("Mission Control proxies pending Due Diligence requests and approval to ListingStream", async () => {
  const queueRoute = await readFile("src/app/api/listingstream/due-diligence-requests/route.ts", "utf8");
  const approveRoute = await readFile("src/app/api/listingstream/due-diligence-requests/[requestId]/approve/route.ts", "utf8");

  assert.match(queueRoute, /requirePierManagerAuth/);
  assert.match(queueRoute, /\/api\/broker\/due-diligence-requests/);
  assert.match(queueRoute, /getPropertyPortalInternalHeaders/);
  assert.match(approveRoute, /requirePierManagerAuth/);
  assert.match(approveRoute, /\/api\/broker\/due-diligence-requests\/\$\{encodeURIComponent\(requestId\)\}\/approve/);
  assert.match(approveRoute, /POST/);
});

test("Mission Control vault document upload renames files from required description and registers with ListingStream", async () => {
  const uploadRoute = await readFile("src/app/api/listingstream/vault-documents/upload/route.ts", "utf8");
  const storageHelper = await readFile("src/lib/firebase-storage-server.ts", "utf8");

  assert.match(uploadRoute, /description/);
  assert.match(uploadRoute, /propertyId/);
  assert.match(uploadRoute, /registerVaultDocument/);
  assert.match(storageHelper, /uploadVaultDocumentToFirebase/);
  assert.match(storageHelper, /Title_Policy\.pdf/);
  assert.match(storageHelper, /descriptionToFilename/);
});
