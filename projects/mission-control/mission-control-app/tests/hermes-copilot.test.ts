import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  buildCopilotPrompt,
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

test("Hermes Co-Pilot browser console file is deleted with the stripped widget UI", () => {
  assert.equal(readFileSync("src/app/hermes-co-pilot/page.tsx", "utf8").includes("redirect(\"/\")"), true);
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
