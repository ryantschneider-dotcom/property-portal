import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  buildCopilotPrompt,
  buildMasterConsolePrompt,
  copilotSlashCommands,
  createCopilotAssistantFallback,
  getCopilotHistoryFromRequestBody,
  normalizeCopilotMessages,
  parseCopilotCommand,
  renderMarkdownPreview,
  stripReasoningTags,
} from "../src/lib/hermes-copilot";

test("Hermes Co-Pilot registers Ryan's hard-coded slash command suite", () => {
  assert.deepEqual(
    copilotSlashCommands.map((command) => command.name),
    ["/intel", "/spin", "/ig_cre", "/ig_life", "/site", "/scrape", "/status"],
  );
});

test("Hermes Co-Pilot parser extracts command and argument payloads", () => {
  assert.deepEqual(parseCopilotCommand("/intel Savannah port expansion"), {
    type: "slash-command",
    command: "/intel",
    args: "Savannah port expansion",
  });

  assert.deepEqual(parseCopilotCommand("Need help with this listing"), {
    type: "chat",
    command: null,
    args: "Need help with this listing",
  });
});

test("Hermes Co-Pilot prompt wraps slash commands in business-specific execution instructions", () => {
  const prompt = buildCopilotPrompt("/scrape", "12 West State Street, Savannah, GA 31401", []);
  assert.match(prompt, /county GIS\/qPublic playbook/i);
  assert.match(prompt, /12 West State Street/);
  assert.match(prompt, /return the raw data/i);
  assert.match(prompt, /Savannah, Chatham County, GA/i);
  assert.match(prompt, /unless explicitly stated otherwise/i);
});

test("Hermes Co-Pilot prompt carries prior chat turns into follow-up requests", () => {
  const prompt = buildCopilotPrompt(null, "chatham county, ga", [
    { id: "u1", role: "user", content: "/scrape 12 West State Street", createdAt: "2026-06-14T00:00:00.000Z" },
    { id: "a1", role: "assistant", content: "What county and state is this in?", createdAt: "2026-06-14T00:00:01.000Z" },
  ]);

  assert.match(prompt, /Active Mission Control conversation context/i);
  assert.match(prompt, /USER: \/scrape 12 West State Street/);
  assert.match(prompt, /ASSISTANT: What county and state is this in\?/);
  assert.match(prompt, /chatham county, ga/i);
});

test("Hermes Co-Pilot slash prompts explicitly require immediate tool execution", () => {
  const scrapePrompt = buildCopilotPrompt("/scrape", "12 West State Street, Savannah, GA 31401", []);
  const intelPrompt = buildCopilotPrompt("/intel", "Savannah port expansion", []);

  for (const prompt of [scrapePrompt, intelPrompt]) {
    assert.match(prompt, /execute the required tools immediately/i);
    assert.match(prompt, /do not acknowledge.*queue|do not say.*processing|do not wait for another system/i);
    assert.match(prompt, /return only the execution results/i);
  }
  assert.match(scrapePrompt, /you are the executor/i);
  assert.match(scrapePrompt, /run.*GIS|query.*ArcGIS|use.*tools/i);
});

test("Hermes Co-Pilot /site prompt hardcodes the native ListingStream TypeScript execution path", () => {
  const prompt = buildCopilotPrompt("/site", "12 West State Street", []);

  assert.match(prompt, /To execute this request, use your terminal tool to run the native TypeScript pipeline located in \/Users\/macclaw\/listingstream-portal\/src\/lib\/offering-site-generation\.ts via npx tsx\./);
  assert.match(prompt, /createOfferingSiteGenerationJob/);
  assert.match(prompt, /runOfferingSiteGate2/);
  assert.match(prompt, /runOfferingSiteGate5/);
  assert.match(prompt, /Do NOT run '\/site' as a shell command\./);
  assert.match(prompt, /12 West State Street/);
});

test("Master Co-Pilot prompt uses concierge persona across life and operations domains", () => {
  const prompt = buildMasterConsolePrompt("Plan a broad Shopify and PIER operations sprint", [
    { id: "u1", role: "user", content: "I need a better week", createdAt: "2026-06-17T00:00:00.000Z" },
  ]);

  assert.match(prompt, /high-end hotel concierge/i);
  assert.match(prompt, /PIER Commercial Real Estate/);
  assert.match(prompt, /personal life logistics/);
  assert.match(prompt, /Shopify management/);
  assert.match(prompt, /independent app development/);
  assert.match(prompt, /ask concise multi-turn clarifying questions/i);
  assert.match(prompt, /Output contract: Return only the final user-facing concierge message/);
  assert.match(prompt, /Active Master Console conversation context/);
});

test("Master Co-Pilot sanitizer removes prompt-analysis preamble from clarifying questions", () => {
  const dirty = `The user has stated: "Help me plan a broad personal logistics request."
This is a request for clarification before execution.
Based on the prompt's "Interaction model": ask questions first.
I will ask a concise set of questions to narrow down the request without narrating my internal thought process. To assist with your personal logistics, could you please tell me:
* What is the primary area you'd like assistance with?
* What specific outcome do you want?
* What is the desired timeframe?`;
  const clean = stripReasoningTags(dirty);

  assert.doesNotMatch(clean, /The user has stated|Based on the prompt|Interaction model|internal thought process/);
  assert.match(clean, /To assist with your personal logistics/);
  assert.match(clean, /desired timeframe/);
});

test("Hermes Co-Pilot strips internal reasoning tags before rendering", () => {
  const dirty = "Before\n<think>I should not be visible\nwith multiple lines</think>\n<tool>{\"secret\":true}</tool>\nAfter <final>parcel data</final> done";
  const clean = stripReasoningTags(dirty);

  assert.equal(clean, "Before\nAfter parcel data done");
  assert.doesNotMatch(renderMarkdownPreview(dirty), /I should not be visible|secret|think|tool|final/i);
});

test("Hermes Co-Pilot accepts copilotMessages request history from the browser", () => {
  const history = getCopilotHistoryFromRequestBody({
    copilotMessages: [
      { id: "u1", role: "user", content: "/scrape 12 West State Street", createdAt: "2026-06-14T00:00:00.000Z" },
      { id: "a1", role: "assistant", content: "What county and state is this in?", createdAt: "2026-06-14T00:00:01.000Z" },
    ],
  });

  assert.equal(history.length, 2);
  assert.equal(history[0].content, "/scrape 12 West State Street");
  assert.equal(history[1].content, "What county and state is this in?");
});

test("Hermes Co-Pilot memory normalization preserves active conversation history only", () => {
  const messages = normalizeCopilotMessages([
    { id: "u1", role: "user", content: "hello", createdAt: "2026-06-14T00:00:00.000Z" },
    { id: "bad", role: "system", content: "drop", createdAt: "bad" },
    { id: "a1", role: "assistant", content: "hi", createdAt: "2026-06-14T00:00:01.000Z" },
  ]);

  assert.equal(messages.length, 2);
  assert.equal(messages[0].role, "user");
  assert.equal(messages[1].role, "assistant");
});

test("Hermes Co-Pilot status fallback reports Vercel/OpenClaw health and secure tunnel config", () => {
  const output = createCopilotAssistantFallback({
    message: "/status",
    command: "/status",
    args: "",
    backend: { ok: true, status: "live" },
    action: { ok: true, summary: "Vercel reachable; queue nominal" },
  });

  assert.match(output, /OpenClaw: live/i);
  assert.match(output, /Vercel reachable/i);
  assert.match(output, /secure tunnel/i);
});

test("Hermes Co-Pilot API remains stateless on Vercel and never imports the disk store", () => {
  const routeSource = readFileSync("src/app/api/hermes-copilot/route.ts", "utf8");

  assert.doesNotMatch(routeSource, /@\/lib\/storage/);
  assert.doesNotMatch(routeSource, /readStore|writeStore|pushActivityEvent/);
});

test("Master Co-Pilot Console route is active after the stripped widget UI", () => {
  const page = readFileSync("src/app/master-console/page.tsx", "utf8");
  const legacyPage = readFileSync("src/app/hermes-co-pilot/page.tsx", "utf8");
  assert.match(page, /MasterCopilotConsole/);
  assert.equal(legacyPage.includes("redirect(\"/\")"), true);
});

test("Hermes Co-Pilot route renders actual OpenClaw payload instead of queued acknowledgement", () => {
  const routeSource = readFileSync("src/app/api/hermes-copilot/route.ts", "utf8");
  const clientSource = readFileSync("src/lib/openclaw-client.ts", "utf8");

  assert.match(routeSource, /openClaw\.text/);
  assert.doesNotMatch(routeSource, /Your command is now running in the active Hermes\/OpenClaw session/);
  assert.doesNotMatch(routeSource, /County GIS\/qPublic playbook queued/);
  assert.match(clientSource, /agent\.wait/);
  assert.match(clientSource, /chat\.history/);
  assert.match(clientSource, /copilot-exec/);
  assert.match(clientSource, /DEFAULT_PUBLIC_COPILOT_ORIGIN/);
  assert.match(clientSource, /OPENCLAW_COPILOT_EXEC_URL/);
  assert.match(clientSource, /process\.env\.VERCEL/);
  assert.match(routeSource, /getCopilotHistoryFromRequestBody/);
  assert.match(routeSource, /history/);
  assert.match(clientSource, /history/);
});

test("Mission Control Hermes Console uses the working OpenClaw bridge plus session history surfaces", () => {
  const consoleSource = readFileSync("src/components/master-copilot-console.tsx", "utf8");
  const copilotRoute = readFileSync("src/app/api/hermes-copilot/route.ts", "utf8");
  const sessionsRoute = readFileSync("src/app/api/hermes-console/sessions/route.ts", "utf8");
  const clientSource = readFileSync("src/lib/hermes-api-client.ts", "utf8");

  assert.match(consoleSource, /Mission Control Hermes Console/);
  assert.match(consoleSource, /Previous Telegram sessions/);
  assert.match(consoleSource, /not a PIER-only assistant|Scope\" value=\"General/);
  assert.match(consoleSource, /\/api\/hermes-copilot/);
  assert.doesNotMatch(consoleSource, /\/api\/hermes-console\/runs/);
  assert.match(consoleSource, /\/api\/hermes-console\/sessions/);
  assert.match(copilotRoute, /sendOpenClawChat/);
  assert.match(copilotRoute, /consoleMode === "master"/);
  assert.match(sessionsRoute, /searchHermesSessions/);
  assert.match(sessionsRoute, /compactSessionMessages/);
  assert.match(clientSource, /\/api\/sessions/);
  assert.match(clientSource, /DEFAULT_PUBLIC_HERMES_API_URL/);
});

test("Mission Control OS separates global Hermes chat from the PIER Commercial workspace", () => {
  const homePage = readFileSync("src/app/page.tsx", "utf8");
  const pierWorkspace = readFileSync("src/app/pier-workspace/page.tsx", "utf8");
  const shellSource = readFileSync("src/components/mission-shell.tsx", "utf8");
  const authSource = readFileSync("src/lib/auth.ts", "utf8");

  assert.match(homePage, /Mission Control OS/);
  assert.match(homePage, /Global Hermes Master Chat/);
  assert.match(homePage, /MasterCopilotConsole mode=\"dashboard\"/);
  assert.match(homePage, /Domain cards/);
  assert.match(homePage, /href=\"\/pier-workspace\"/);
  assert.match(pierWorkspace, /PIER Commercial Brokerage/);
  assert.match(pierWorkspace, /Listing Portal Intake/);
  assert.match(pierWorkspace, /Listing Revisions/);
  assert.match(pierWorkspace, /Website Creation/);
  assert.match(pierWorkspace, /Email Creation/);
  assert.match(pierWorkspace, /OM Creation/);
  assert.match(pierWorkspace, /PIER Commercial Company Marketing/);
  assert.match(pierWorkspace, /WordPress Pulse Drop/);
  assert.match(pierWorkspace, /Instagram Post Generation/);
  assert.match(pierWorkspace, /Facebook Post Generation/);
  assert.match(shellSource, /PIER Workspace/);
  assert.match(authSource, /\/pier-workspace/);
});
