import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const drawerSource = () => readFileSync("src/components/hermes-copilot-drawer.tsx", "utf8");
const attachmentRouteSource = () => readFileSync("src/app/api/hermes-copilot/attachments/route.ts", "utf8");
const storageSource = () => readFileSync("src/lib/mission-control-firebase-storage.ts", "utf8");

test("Co-Pilot browser uses signed upload URLs and never posts raw File/FormData bodies through Vercel", () => {
  const source = drawerSource();

  assert.match(source, /prepareDirectUpload/i);
  assert.match(source, /signedUpload\.uploadUrl/);
  assert.match(source, /method:\s*"PUT"/);
  assert.match(source, /body:\s*attachment\.file/);
  assert.match(source, /"content-type":\s*"application\/json"/);
  assert.doesNotMatch(source, /new FormData\(\)/);
  assert.doesNotMatch(source, /formData\.append\("files"/);
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
