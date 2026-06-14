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
  assert.match(consoleSource, /CoStar \/ LoopNet and Crexi rep-email dispatches/);
  assert.match(consoleSource, /accepted by Resend/);
  assert.match(consoleSource, /native direct syndication to CityFeet/);
  assert.match(consoleSource, /CoStar|LoopNet|Crexi|Brevitas/);
  assert.match(consoleSource, /Refresh status/);
  assert.match(consoleSource, /Manual retry/);
});
