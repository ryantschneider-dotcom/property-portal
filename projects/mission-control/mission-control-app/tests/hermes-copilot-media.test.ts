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

test("Hermes Co-Pilot uploads attachments before send and forwards URLs into the chat request", () => {
  const source = drawerSource();

  assert.match(source, /fetch\("\/api\/hermes-copilot\/attachments"/);
  assert.match(source, /FormData/);
  assert.match(source, /attachments: uploadedAttachments/);
  assert.match(source, /copilotMessages: requestHistory/);
  assert.match(source, /pendingAttachments/);
});

test("Hermes Co-Pilot attachment route uses authenticated Firebase storage with file limits", () => {
  const source = attachmentRouteSource();

  assert.match(source, /requireAuth\(\)/);
  assert.match(source, /uploadMissionControlFirebaseFile/);
  assert.match(source, /MAX_COPILOT_ATTACHMENT_BYTES/);
  assert.match(source, /ALLOWED_COPILOT_ATTACHMENT_TYPES/);
  assert.match(source, /hermes-copilot/);
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
