import { readFile } from "node:fs/promises";
import test from "node:test";
import assert from "node:assert/strict";

test("root route is a public Firestore-backed map plus property grid, not broker-host gated", async () => {
  const pageSource = await readFile("src/app/page.tsx", "utf8");
  const propertiesSource = await readFile("src/lib/properties.ts", "utf8");
  const mapSource = await readFile("src/components/public-property-map.tsx", "utf8");

  assert.doesNotMatch(pageSource, /isBrokerHost/);
  assert.doesNotMatch(pageSource, /BrokerHostHome/);
  const middlewareSource = await readFile("src/middleware.ts", "utf8");
  assert.doesNotMatch(middlewareSource, /path === '\/'[\s\S]*?NextResponse\.redirect\(new URL\('\/broker'/);
  assert.match(pageSource, /<PublicPropertyMap properties=\{properties\}/);
  assert.match(pageSource, /<PropertyGrid properties=\{properties\}/);
  assert.match(pageSource, /listPublicPropertyCards/);

  assert.match(propertiesSource, /PUBLIC_LISTINGS_COLLECTION/);
  assert.match(propertiesSource, /publishStatus\s*===\s*"published"/);
  assert.match(propertiesSource, /item\.status\s*===\s*"active"/);
  assert.match(propertiesSource, /location:\s*\{/);

  assert.match(mapSource, /export function PublicPropertyMap/);
  assert.match(mapSource, /Map View/);
  assert.match(mapSource, /View details/);
  assert.match(mapSource, /href=\{`\/properties\/\$\{property\.slug\}`\}/);
});

test("broker new listing page matches the dark-bubble mockup hierarchy and copy", async () => {
  const layoutSource = await readFile("src/app/broker/layout.tsx", "utf8");
  const pageSource = await readFile("src/app/broker/new/page.tsx", "utf8");
  const formSource = await readFile("src/components/broker-hub-intake-form.tsx", "utf8");

  assert.match(layoutSource, /PIER Internal Broker Hub/);
  assert.doesNotMatch(layoutSource, /Internal Admin/);
  assert.match(layoutSource, /py-2/);

  assert.match(pageSource, /A broker-first workflow designed to feel faster, sharper, and more premium than Buildout\./);
  assert.match(pageSource, /max-w-\[680px\]/);
  assert.match(pageSource, /rounded-\[1\.35rem\]/);
  assert.match(pageSource, /bg-\[radial-gradient\(circle_at_top_left,rgba\(203,82,30,0\.22\),transparent_34%\),linear-gradient\(135deg,#111827_0%,#172033_58%,#263245_100%\)\]/);
  assert.match(pageSource, /Dashboard/);
  assert.match(pageSource, /New Listing Entry/);

  assert.match(formSource, /max-w-\[680px\]/);
  assert.match(formSource, /Launch a listing that already feels half-finished\./);
  assert.match(formSource, /The PIER Commercial Big Brain/);
  assert.doesNotMatch(formSource, /Mack/);
  assert.match(formSource, /rounded-\[1\.35rem\]/);
  assert.match(formSource, /1\. Property basics/);
  assert.match(formSource, /2\. Pricing \/ deal structure/);
  assert.match(formSource, /focus:border-\[var\(--pier-orange\)\]/);
});
