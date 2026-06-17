import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { stripReasoningTags } from "../src/lib/hermes-copilot";

const shellSource = () => readFileSync("src/components/mission-shell.tsx", "utf8");
const pageSource = () => readFileSync("src/app/hermes-co-pilot/page.tsx", "utf8");
const chatSource = () => readFileSync("src/app/chat/page.tsx", "utf8");

test("Hermes Co-Pilot routes redirect back to the dashboard instead of rendering a widget", () => {
  const page = pageSource();
  const chat = chatSource();

  assert.match(page, /redirect\("\/"\)/);
  assert.match(chat, /redirect\("\/"\)/);
  assert.doesNotMatch(page, /HermesCopilotMasterConsole|HermesCopilotConsole/);
});

test("MissionShell has no floating Co-Pilot widget suppression branch because the widget is gone", () => {
  const source = shellSource();

  assert.doesNotMatch(source, /currentPath !== "\/hermes-co-pilot"/);
  assert.doesNotMatch(source, /showFloatingCopilot/);
  assert.doesNotMatch(source, /HermesCopilotDrawer/);
});

test("Co-Pilot output sanitizer removes thought tags, internal plans, and meta-analysis before rendering", () => {
  const raw = `<thought>private chain of thought</thought>\nMy plan is:\n1. Analyze the screenshot.\n2. Decide the fix.\n\nFinal answer:\n## Fixed\n\nThe visible answer remains.`;
  const cleaned = stripReasoningTags(raw);

  assert.doesNotMatch(cleaned, /private chain of thought/i);
  assert.doesNotMatch(cleaned, /My plan is/i);
  assert.doesNotMatch(cleaned, /Analyze the screenshot/i);
  assert.doesNotMatch(cleaned, /Final answer:/i);
  assert.match(cleaned, /## Fixed/);
  assert.match(cleaned, /The visible answer remains\./);
});

test("Co-Pilot backend route sanitizes assistant output before both message and openClaw payload leave the API", () => {
  const source = readFileSync("src/app/api/hermes-copilot/route.ts", "utf8");

  assert.match(source, /const sanitizedOpenClawText = openClaw\.ok \? stripReasoningTags\(openClaw\.text/);
  assert.match(source, /openClaw: sanitizedOpenClaw/);
  assert.match(source, /makeMessage\("assistant", assistantContent/);
});
