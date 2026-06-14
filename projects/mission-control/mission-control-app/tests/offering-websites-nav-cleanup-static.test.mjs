import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const shell = readFileSync("src/components/mission-shell.tsx", "utf8");
const home = readFileSync("src/app/page.tsx", "utf8");
const legacyOfferingRoute = readFileSync("src/app/offering-websites/page.tsx", "utf8");
const pierManager = readFileSync("src/components/pier-manager-listing-console.tsx", "utf8");

test("legacy Offering Websites nav tab is removed", () => {
  assert.doesNotMatch(shell, /label:\s*"Offering Websites"/);
  assert.doesNotMatch(shell, /href:\s*"\/offering-websites"/);
  assert.match(shell, /label:\s*"PIER Manager"/);
});

test("dashboard routes offering-site activity only to PIER Manager", () => {
  assert.doesNotMatch(home, /title:\s*"Offering Websites"/);
  assert.doesNotMatch(home, /href:\s*"\/offering-websites"/);
  assert.doesNotMatch(home, /Preview public website plans/);
  assert.match(home, /Open Gate 5 Command Center/);
  assert.match(home, /href="\/pier-manager"/);
});

test("legacy offering-websites path contains no static scaffolding or dead project links", () => {
  assert.match(legacyOfferingRoute, /redirect\("\/pier-manager"\)/);
  assert.doesNotMatch(legacyOfferingRoute, /Choose listing|Upload images|Edit source record|\/projects/);
  assert.doesNotMatch(legacyOfferingRoute, /buildOfferingWebsitePlan|Generated offering website plans|Phase 3 public-output rules/);
});

test("PIER Manager remains the sole Offering Site Command Center surface", () => {
  assert.match(pierManager, /data-testid="offering-site-command-center"/);
  assert.match(pierManager, /Offering Site Command Center/);
  assert.match(pierManager, /gate:\s*"5"/);
});
