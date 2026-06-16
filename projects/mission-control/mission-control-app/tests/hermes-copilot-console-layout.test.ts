import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { stripReasoningTags } from "../src/lib/hermes-copilot";

const shellSource = () => readFileSync("src/components/mission-shell.tsx", "utf8");
const pageSource = () => readFileSync("src/app/hermes-co-pilot/page.tsx", "utf8");
const drawerSource = () => readFileSync("src/components/hermes-copilot-drawer.tsx", "utf8");

test("Hermes Co-Pilot page uses the full-page master console instead of the stale static console", () => {
  const page = pageSource();
  const drawer = drawerSource();

  assert.match(page, /HermesCopilotMasterConsole/);
  assert.doesNotMatch(page, /HermesCopilotConsole/);
  assert.match(drawer, /variant=\"page\"/);
  assert.match(drawer, /Hermes Co-Pilot master console/);
  assert.match(drawer, /min-h-\[calc\(100vh-190px\)\]/);
  assert.match(drawer, /sm:grid-cols-3/);
});

test("MissionShell suppresses the floating Co-Pilot widget on the dedicated Co-Pilot page", () => {
  const source = shellSource();

  assert.match(source, /currentPath !== "\/hermes-co-pilot"/);
  assert.match(source, /showFloatingCopilot/);
  assert.match(source, /showFloatingCopilot && <HermesCopilotDrawer/);
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
