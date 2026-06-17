import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";

const shellSource = () => readFileSync("src/components/mission-shell.tsx", "utf8");

test("MissionShell permanently omits the native Hermes Co-Pilot drawer widget", () => {
  const source = shellSource();

  assert.doesNotMatch(source, /HermesCopilotDrawer/);
  assert.doesNotMatch(source, /@\/components\/hermes-copilot-drawer/);
  assert.doesNotMatch(source, /showFloatingCopilot/);
  assert.doesNotMatch(source, /<HermesCopilotDrawer\s*\/>/);
});

test("Hermes Co-Pilot widget component files are physically deleted", () => {
  assert.equal(existsSync("src/components/hermes-copilot-drawer.tsx"), false);
  assert.equal(existsSync("src/components/hermes-copilot-console.tsx"), false);
});

test("Mission Control navigation no longer exposes chat or Co-Pilot links", () => {
  const source = shellSource();

  assert.doesNotMatch(source, /Hermes Co-Pilot/);
  assert.doesNotMatch(source, /\/chat/);
  assert.doesNotMatch(source, /\/hermes-co-pilot/);
});
