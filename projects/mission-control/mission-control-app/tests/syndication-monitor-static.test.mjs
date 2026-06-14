import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const route = readFileSync("src/app/api/listingstream/syndication/route.ts", "utf8");
const consoleSource = readFileSync("src/components/pier-manager-listing-console.tsx", "utf8");

test("Mission Control exposes authenticated mobile syndication status proxy", () => {
  assert.match(route, /requirePierManagerAuth/);
  assert.match(route, /buildPropertyPortalUrl\("\/api\/admin\/syndication"\)/);
  assert.match(route, /getPropertyPortalInternalHeaders/);
  assert.match(route, /export async function POST/);
});

test("PIER Manager includes mobile-first CoStar and Crexi rep-email syndication monitor copy", () => {
  assert.match(consoleSource, /Syndication Command Center/);
  assert.match(consoleSource, /finalized external channels: CoStar \/ LoopNet and Crexi/);
  assert.match(consoleSource, /accepted by Resend/);
  assert.match(consoleSource, /ListingStream remains the internal source of truth/);
  assert.doesNotMatch(consoleSource, /CityFeet|TenantBase|CommercialSource|CommercialEdge|TheBrokerList|Brevitas|native direct syndication/);
  assert.match(consoleSource, /Refresh status/);
  assert.match(consoleSource, /Manual retry/);
});
