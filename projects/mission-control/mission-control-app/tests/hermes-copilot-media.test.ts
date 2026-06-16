import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { buildCopilotPrompt, normalizeCopilotAttachments } from "../src/lib/hermes-copilot";

const drawerSource = () => readFileSync("src/components/hermes-copilot-drawer.tsx", "utf8");
const routeSource = () => readFileSync("src/app/api/hermes-copilot/route.ts", "utf8");
const attachmentRouteSource = () => readFileSync("src/app/api/hermes-copilot/attachments/route.ts", "utf8");

test("Hermes Co-Pilot composer captures pasted screenshots, dropped files, and manual attachments", () => {
  const source = drawerSource();

  assert.match(source, /onPaste=\{handlePaste\}/);
  assert.match(source, /onDrop=\{handleDrop\}/);
  assert.match(source, /onDragOver=\{handleDragOver\}/);
  assert.match(source, /type="file"/);
  assert.match(source, /aria-label="Attach files to Hermes Co-Pilot"/);
  assert.match(source, /accept="image\/\*,application\/pdf,text\/plain,text\/csv,application\/json/);
  assert.match(source, /URL\.createObjectURL/);
  assert.match(source, /attachmentPreviews/);
  assert.match(source, /min-h-\[44px\]/);
});

test("Hermes Co-Pilot uploads attachments directly before send and forwards URLs into the chat request", () => {
  const source = drawerSource();

  assert.match(source, /fetch\("\/api\/hermes-copilot\/attachments"/);
  assert.match(source, /prepareDirectUpload/);
  assert.match(source, /signedUpload\.uploadUrl/);
  assert.match(source, /method:\s*"PUT"/);
  assert.match(source, /body:\s*attachment\.file/);
  assert.doesNotMatch(source, /new FormData\(\)/);
  assert.match(source, /attachments: uploadedAttachments/);
  assert.match(source, /copilotMessages: requestHistory/);
  assert.match(source, /pendingAttachments/);
});

test("Hermes Co-Pilot attachment route uses authenticated signed Firebase storage URLs with file limits", () => {
  const source = attachmentRouteSource();

  assert.match(source, /requireAuth\(\)/);
  assert.match(source, /createMissionControlFirebaseSignedUpload/);
  assert.match(source, /MAX_COPILOT_ATTACHMENT_BYTES/);
  assert.match(source, /ALLOWED_COPILOT_ATTACHMENT_TYPES/);
  assert.match(source, /hermes-copilot/);
  assert.doesNotMatch(source, /request\.formData\(\)/);
});

test("Hermes Co-Pilot prompt carries uploaded file URLs into the execution context", () => {
  const attachments = normalizeCopilotAttachments([
    { id: "a1", name: "screenshot.png", url: "https://cdn.example/screenshot.png", contentType: "image/png", size: 1024 },
    { id: "a2", name: "lease.pdf", url: "https://cdn.example/lease.pdf", contentType: "application/pdf", size: 2048 },
  ]);

  const prompt = buildCopilotPrompt(null, "What is wrong with this screenshot?", [], attachments);

  assert.match(prompt, /Attached Mission Control files/);
  assert.match(prompt, /screenshot\.png/);
  assert.match(prompt, /https:\/\/cdn\.example\/screenshot\.png/);
  assert.match(prompt, /lease\.pdf/);
});

test("Hermes Co-Pilot POST route accepts attachments and passes them into buildCopilotPrompt", () => {
  const source = routeSource();

  assert.match(source, /attachments\?: unknown/);
  assert.match(source, /normalizeCopilotAttachments\(body\.attachments\)/);
  assert.match(source, /buildCopilotPrompt\(parsed\.command, parsed\.args, history, attachments\)/);
});

test("Hermes Co-Pilot preserves Firebase storage paths for server-side vision reads", () => {
  const attachments = normalizeCopilotAttachments([
    {
      id: "a1",
      name: "photo.jpg",
      url: "https://firebasestorage.example/photo.jpg?token=missing",
      contentType: "image/jpeg",
      size: 6_340_864,
      storagePath: "mission-control/hermes-copilot/2026-06-16/photo.jpg",
    },
  ]);

  assert.equal(attachments[0]?.storagePath, "mission-control/hermes-copilot/2026-06-16/photo.jpg");
});

test("Hermes Co-Pilot route invokes the multimodal vision layer and falls back to vision text if OpenClaw stalls", () => {
  const source = routeSource();
  const visionSource = readFileSync("src/lib/copilot-vision.ts", "utf8");

  assert.match(source, /analyzeCopilotImageAttachments/);
  assert.match(source, /Multimodal vision analysis already performed/);
  assert.match(source, /visionFallbackText/);
  assert.match(source, /timeoutMs:\s*vision\?\.ok \? 22000 : 55000/);
  assert.match(visionSource, /gemini-2\.5-flash/);
  assert.match(visionSource, /inlineData/);
  assert.match(visionSource, /fetchFirebaseStorageObject/);
});
