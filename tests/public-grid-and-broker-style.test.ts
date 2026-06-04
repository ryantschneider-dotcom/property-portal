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

test("broker new listing page matches the requested two-bubble hierarchy and exact PIER Big Brain copy", async () => {
  const layoutSource = await readFile("src/app/broker/layout.tsx", "utf8");
  const pageSource = await readFile("src/app/broker/new/page.tsx", "utf8");
  const formSource = await readFile("src/components/broker-hub-intake-form.tsx", "utf8");
  const revisionsSource = await readFile("src/components/broker-hub-revisions-form.tsx", "utf8");

  assert.match(layoutSource, /Internal Admin/);
  assert.match(layoutSource, /PIER Internal Broker Hub/);

  assert.match(pageSource, /PIER COMMERCIAL/);
  assert.match(pageSource, /New Listing Entry/);
  assert.match(pageSource, /BrokerHubIntakeForm/);
  assert.match(pageSource, /BrokerHubRevisionsForm/);
  assert.match(pageSource, /A broker-first workflow designed to feel faster, sharper, and more premium than Buildout\./);
  assert.match(pageSource, /bg-\[radial-gradient\(circle_at_top_left,rgba\(203,82,30,0\.22\),transparent_34%\),linear-gradient\(135deg,#111827_0%,#172033_58%,#263245_100%\)\]/);

  assert.match(formSource, /className="mx-auto flex max-w-\[680px\] flex-col gap-4"/);
  assert.match(formSource, /rounded-\[1\.35rem\] bg-white\/85 p-3 shadow-\[0_18px_60px_rgba\(15,23,42,0\.10\)\]/);
  assert.match(formSource, /PIER BROKER HUB/);
  assert.match(formSource, /Launch a listing that already feels half-finished\./);
  assert.match(formSource, /The PIER Big Brain, your senior associate broker assistant, will automatically scrape public records to fill in missing property details, research the trade area, and generate polished marketing copy and descriptions where you leave blanks/);
  assert.match(formSource, /Minimum to Submit/);
  assert.match(formSource, /grid gap-3 lg:grid-cols-\[1\.05fr_0\.95fr\]/);
  assert.match(formSource, /The PIER Big Brain is Working/);
  assert.match(formSource, /Broker Note/);
  assert.doesNotMatch(formSource, /Mack/);
  assert.match(formSource, /1\. Property basics/);
  assert.match(formSource, /Street address/);
  assert.match(formSource, /City/);
  assert.match(formSource, /Property type/);
  assert.match(formSource, /Sale price/);
  assert.match(formSource, /2\. Pricing \/ deal structure/);
  assert.match(formSource, /3\. Broker guidance \/ marketing copy/);
  assert.match(formSource, /Property description/);
  assert.match(formSource, /4\. Media \/ source documents/);
  assert.match(formSource, /Hero Photo/);
  assert.match(formSource, /Generate Enriched Review Draft/);
  assert.match(formSource, /\/api\/broker\/intake/);
  assert.match(formSource, /focus:border-\[var\(--pier-orange\)\]/);

  assert.match(revisionsSource, /Existing Listing Modification/);
  assert.match(revisionsSource, /AI Delta/);
  assert.match(revisionsSource, /Select active property-portal listing/);
  assert.match(revisionsSource, /Tell The PIER Big Brain what changed/);
  assert.match(revisionsSource, /\/api\/broker\/active-listings/);
  assert.match(revisionsSource, /\/api\/broker\/revisions/);
  assert.doesNotMatch(revisionsSource, /Mack/);
});
