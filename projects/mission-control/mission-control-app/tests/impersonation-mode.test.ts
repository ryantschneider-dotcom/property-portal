import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import {
  createAuthToken,
  getAuthSession,
  normalizeBrokerId,
  canImpersonateBroker,
  getLoginRole,
} from "../src/lib/auth";
import { getBrokerProfileForSession } from "../src/lib/offering-summary-pdf";

function configurePasswords() {
  process.env.MISSION_CONTROL_PASSWORD = "master-secret";
  process.env.BROKER_PASSWORD = "broker-secret";
}

test("master session tokens can carry a sanitized active broker context for View As", async () => {
  configurePasswords();

  const token = await createAuthToken("master", Date.now(), "Joel Boblasky");
  const session = await getAuthSession(token);

  assert.deepEqual(session, { role: "master", brokerId: "joel" });
  assert.equal(getBrokerProfileForSession(session).name, "Joel Boblasky");
  assert.equal(normalizeBrokerId("Ryan T. Schneider, CCIM"), "ryan");
  assert.equal(normalizeBrokerId("Anthony Wagner"), "anthony");
  assert.equal(normalizeBrokerId("unknown"), "ryan");
});

test("master and staff sessions can use broker switching", () => {
  assert.equal(canImpersonateBroker({ role: "master" }), true);
  assert.equal(canImpersonateBroker({ role: "staff", brokerId: "joel" }), true);
  assert.equal(canImpersonateBroker({ role: "master", brokerId: "joel" }), true);
  assert.equal(canImpersonateBroker({ role: "broker", brokerId: "joel" }), false);
  assert.equal(canImpersonateBroker(null), false);
});

test("login no longer hardcodes Ryan as the broker context for every auth cookie", async () => {
  const source = await readFile("src/app/api/auth/login/route.ts", "utf8");

  assert.doesNotMatch(source, /body\.brokerId \|\| "ryan"/);
  assert.match(source, /role === "broker"/);

  process.env.MISSION_CONTROL_PASSWORD = "master-secret";
  delete process.env.BROKER_PASSWORD;
  assert.equal(getLoginRole("master-secret"), "master");
});

test("admin and staff impersonation endpoint rewrites the signed auth cookie with selected broker", async () => {
  const source = await readFile("src/app/api/auth/impersonation/route.ts", "utf8");

  assert.match(source, /getAuthSession/);
  assert.match(source, /session\?\.role !== "master" && session\?\.role !== "staff"/);
  assert.match(source, /normalizeBrokerId/);
  assert.match(source, /createAuthToken\(session\.role/);
  assert.match(source, /brokerId/);
});

test("MissionShell exposes a clear View As control and impersonation banner only to master", async () => {
  const shell = await readFile("src/components/mission-shell.tsx", "utf8");
  const control = await readFile("src/components/view-as-broker-control.tsx", "utf8");

  assert.match(shell, /ViewAsBrokerControl/);
  assert.match(shell, /session\?\.role === "master"/);
  assert.match(shell, /Impersonation Mode/);
  assert.match(control, /\/api\/auth\/impersonation/);
  assert.match(control, /Joel Boblasky/);
  assert.match(control, /Viewing as/);
  assert.match(control, /joel@piercommercial\.com/);
  assert.match(control, /Anthony Wagner/);
});

test("active listings proxy forwards the active broker context to ListingStream", async () => {
  const source = await readFile("src/app/api/listingstream/active-listings/route.ts", "utf8");

  assert.match(source, /getAuthSession/);
  assert.match(source, /brokerId/);
  assert.match(source, /URLSearchParams/);
  assert.match(source, /brokerId/);
  const consoleSource = await readFile("src/components/pier-manager-listing-console.tsx", "utf8");
  assert.match(consoleSource, /activeBrokerId/);
  assert.match(consoleSource, /brokerSenderProfiles/);
  assert.match(consoleSource, /joel@piercommercial\.com/);
});
