import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const shellSource = () => readFileSync("src/components/mission-shell.tsx", "utf8");
const drawerSource = () => readFileSync("src/components/hermes-copilot-drawer.tsx", "utf8");

test("MissionShell mounts a native Hermes Co-Pilot drawer globally", () => {
  const source = shellSource();

  assert.match(source, /HermesCopilotDrawer/);
  assert.match(source, /@\/components\/hermes-copilot-drawer/);
  assert.match(source, /<HermesCopilotDrawer\s*\/>/);
});

test("Hermes Co-Pilot drawer keeps Telegram as the permanent out-of-band backup", () => {
  const source = drawerSource();

  assert.match(source, /Telegram channel remains the permanent out-of-band backup/i);
  assert.match(source, /Out-of-band backup/i);
  assert.match(source, /Telegram/i);
});

test("Hermes Co-Pilot drawer is a mobile-first fixed chat interface backed by the existing API", () => {
  const source = drawerSource();

  assert.match(source, /fixed inset-x-3 bottom-3/i);
  assert.match(source, /sm:inset-auto sm:bottom-5 sm:right-5/i);
  assert.match(source, /fetch\("\/api\/hermes-copilot"/);
  assert.match(source, /localStorage/);
  assert.match(source, /copilotMessages/);
  assert.match(source, /aria-label="Open Hermes Co-Pilot chat"/);
  assert.match(source, /aria-label="Close Hermes Co-Pilot chat"/);
});
