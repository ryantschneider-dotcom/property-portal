import { readFile } from "node:fs/promises";
import test from "node:test";
import assert from "node:assert/strict";

test("public and draft preview property pages render spaces tables with rate column", async () => {
  const publicPageSource = await readFile("src/app/properties/[slug]/page.tsx", "utf8");
  const previewPageSource = await readFile("src/app/preview/[slug]/page.tsx", "utf8");
  const tableSource = await readFile("src/components/property-spaces-table.tsx", "utf8");

  assert.match(publicPageSource, /<PropertySpacesTable spaces=\{property\.spaces \?\? \[\]\}/);
  assert.match(previewPageSource, /<PropertySpacesTable spaces=\{property\.spaces \?\? \[\]\}/);
  assert.match(tableSource, /<th[^>]*>Rate<\/th>/);
  assert.match(tableSource, /formatSpaceRate\(space\)/);
  assert.match(tableSource, /ratePerSf/);
  assert.match(tableSource, /monthlyRate/);
  assert.match(tableSource, /rawRateLabel/);
  assert.match(tableSource, /\/SF/);
  assert.match(tableSource, /\/month/);
});
