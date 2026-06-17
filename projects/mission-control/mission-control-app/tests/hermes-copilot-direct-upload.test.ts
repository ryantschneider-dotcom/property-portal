import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";

const attachmentRouteSource = () => readFileSync("src/app/api/hermes-copilot/attachments/route.ts", "utf8");
const storageSource = () => readFileSync("src/lib/mission-control-firebase-storage.ts", "utf8");

test("Co-Pilot browser upload widget file has been deleted with the rest of the UI widget", () => {
  assert.equal(existsSync("src/components/hermes-copilot-drawer.tsx"), false);
});

test("Co-Pilot attachment route only signs metadata and does not parse multipart form data", () => {
  const source = attachmentRouteSource();

  assert.match(source, /request\.json\(\)/);
  assert.match(source, /createMissionControlFirebaseSignedUpload/);
  assert.match(source, /MAX_COPILOT_ATTACHMENT_BYTES\s*=\s*25 \* 1024 \* 1024/);
  assert.match(source, /attachments: signedUploads/);
  assert.doesNotMatch(source, /request\.formData\(\)/);
  assert.doesNotMatch(source, /uploadMissionControlFirebaseFile/);
});

test("Mission Control Firebase storage can mint temporary V4 signed upload URLs with Firebase download tokens", () => {
  const source = storageSource();

  assert.match(source, /createMissionControlFirebaseSignedUpload/);
  assert.match(source, /X-Goog-Algorithm/);
  assert.match(source, /GOOG4-RSA-SHA256/);
  assert.match(source, /x-goog-meta-firebasestoragedownloadtokens/);
  assert.match(source, /expiresInSeconds/);
  assert.match(source, /firebasestorage\.googleapis\.com\/v0\/b/);
});
