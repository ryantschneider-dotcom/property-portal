import { readFile } from "node:fs/promises";
import test from "node:test";
import assert from "node:assert/strict";

test("admin form schema and UI expose Under Contract as a primary listing status", async () => {
  const adminSource = await readFile("src/lib/admin.ts", "utf8");
  const formSource = await readFile("src/components/admin-property-form.tsx", "utf8");

  assert.match(adminSource, /listingStatus:\s*"active"\s*\|\s*"inactive"\s*\|\s*"under_contract"\s*\|\s*"leased"\s*\|\s*"sold"/);
  assert.match(adminSource, /status === "under_contract"/);
  assert.match(formSource, /<option value="under_contract">Under Contract<\/option>/);
});

test("Firestore/public listing status logic treats under_contract as active but under contract", async () => {
  const propertiesSource = await readFile("src/lib/properties.ts", "utf8");
  const ascendixSource = await readFile("src/lib/ascendix-sync.ts", "utf8");
  const launchSource = await readFile("src/lib/launch-package.ts", "utf8");

  assert.match(propertiesSource, /"under_contract"/);
  assert.match(propertiesSource, /item\.status === "active" \|\| isUnderContractListing\(item\)/);
  assert.match(ascendixSource, /type PortalListingStatus = "active" \| "inactive" \| "under_contract" \| "leased" \| "sold"/);
  assert.match(ascendixSource, /status === "under_contract"/);
  assert.match(launchSource, /status: input\.snapshot\.status/);
  assert.match(launchSource, /listingStatus: input\.snapshot\.listingStatus/);
  assert.match(launchSource, /underContract: input\.snapshot\.underContract/);
});
