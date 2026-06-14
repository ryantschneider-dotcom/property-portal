import test from "node:test";
import assert from "node:assert/strict";

import {
  buildCopilotPrompt,
  copilotSlashCommands,
  createCopilotAssistantFallback,
  normalizeCopilotMessages,
  parseCopilotCommand,
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
