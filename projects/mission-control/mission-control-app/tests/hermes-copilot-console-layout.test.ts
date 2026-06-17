import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { buildMasterConsolePrompt, containsMasterConsoleDelegationRefusal, stripReasoningTags } from "../src/lib/hermes-copilot";

const shellSource = () => readFileSync("src/components/mission-shell.tsx", "utf8");
const pageSource = () => readFileSync("src/app/master-console/page.tsx", "utf8");
const chatSource = () => readFileSync("src/app/chat/page.tsx", "utf8");

test("Master Co-Pilot Console route renders a dashboard-native command node", () => {
  const page = pageSource();
  const component = readFileSync("src/components/master-copilot-console.tsx", "utf8");
  const route = readFileSync("src/app/api/hermes-copilot/route.ts", "utf8");

  assert.match(page, /MasterCopilotConsole/);
  assert.match(page, /currentPath="\/master-console"/);
  assert.match(component, /Master Co-Pilot Console/);
  assert.match(component, /consoleMode: "master"/);
  assert.match(component, /OpenClaw/);
  assert.match(component, /PIER Commercial Real Estate|PIER CRE/);
  assert.match(component, /Shopify/);
  assert.match(component, /desktop-native/i);
  assert.match(route, /buildMasterConsolePrompt/);
  assert.match(chatSource(), /redirect\("\/"\)/);
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

test("Master Console layout uses an unobstructed flex viewport below the sticky header", () => {
  const shell = shellSource();
  const component = readFileSync("src/components/master-copilot-console.tsx", "utf8");

  assert.match(shell, /flex h-screen min-w-0 flex-col overflow-hidden/);
  assert.match(shell, /min-h-0 flex-1 overflow-auto/);
  assert.match(component, /grid h-full min-h-0/);
  assert.match(component, /flex min-h-0 flex-col overflow-hidden/);
  assert.match(component, /min-h-0 flex-1 overflow-y-auto/);
});

test("Master Console prompt and retry guard prioritize autonomous web research over referral-only refusals", () => {
  const prompt = buildMasterConsolePrompt("Plan a trip to Florence next month", []);
  const route = readFileSync("src/app/api/hermes-copilot/route.ts", "utf8");

  assert.match(prompt, /MUST invoke available web-search\/scraping\/research tools/);
  assert.match(prompt, /strictly forbidden from responding with referral-only language/);
  assert.equal(containsMasterConsoleDelegationRefusal("I don't have direct access to real-time travel pricing, so I recommend checking a travel website."), true);
  assert.match(route, /containsMasterConsoleDelegationRefusal/);
  assert.match(route, /buildMasterConsoleToolRetryPrompt/);
});
