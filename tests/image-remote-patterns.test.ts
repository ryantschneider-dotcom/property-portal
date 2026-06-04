import test from "node:test";
import assert from "node:assert/strict";

import nextConfig from "../next.config";

test("Next image config allows Firebase/Google Storage listing images", () => {
  const remotePatterns = nextConfig.images?.remotePatterns ?? [];
  const hostnames = remotePatterns.map((pattern) => pattern.hostname);

  assert.ok(hostnames.includes("storage.googleapis.com"), "storage.googleapis.com must be allowed for ListingStream uploads");
  assert.ok(hostnames.includes("*.firebasestorage.app"), "Firebase Storage bucket hostnames must be allowed");
});
