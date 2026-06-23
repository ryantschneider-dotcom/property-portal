import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("Mission Control listing editor exposes manual coordinate and offering website controls", () => {
  const panel = readFileSync("src/components/listing-edit-panel.tsx", "utf8");
  const dataTypes = readFileSync("src/lib/projects-data.ts", "utf8");
  const route = readFileSync("src/app/api/projects/route.ts", "utf8");

  assert.match(panel, /Use Manual Coordinates/);
  assert.match(panel, /placeholder="Latitude"/);
  assert.match(panel, /placeholder="Longitude"/);
  assert.match(panel, /placeholder="Offering Website URL"/);
  assert.match(panel, /offeringWebsiteUrl/);
  assert.match(panel, /manualLatitude/);
  assert.match(panel, /manualLongitude/);
  assert.match(dataTypes, /offeringWebsiteUrl\?: string/);
  assert.match(dataTypes, /useManualCoordinates\?: boolean/);
  assert.match(route, /offeringWebsiteUrl: clean\(body\.offeringWebsiteUrl\)/);
  assert.match(route, /manualLatitude: cleanNumber\(body\.manualLatitude\)/);
  assert.match(route, /manualLongitude: cleanNumber\(body\.manualLongitude\)/);
});
