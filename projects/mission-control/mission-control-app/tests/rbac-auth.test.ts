import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import {
  createAuthToken,
  getAuthSession,
  getBrokerPassword,
  getLoginRole,
  isBrokerAllowedPath,
  isMasterSession,
  type AuthRole,
} from "../src/lib/auth";

function configurePasswords() {
  process.env.MISSION_CONTROL_PASSWORD = "master-secret";
  process.env.BROKER_PASSWORD = "broker-secret";
}

test("login passwords are classified into master and broker roles", () => {
  configurePasswords();

  assert.equal(getBrokerPassword(), "broker-secret");
  assert.equal(getLoginRole("master-secret"), "master");
  assert.equal(getLoginRole("broker-secret"), "broker");
  assert.equal(getLoginRole("wrong-secret"), null);
});

test("signed auth tokens preserve role and do not accept legacy role-less sessions", async () => {
  configurePasswords();

  const masterToken = await createAuthToken("master");
  const brokerToken = await createAuthToken("broker");
  const legacyToken = await createAuthToken(undefined as unknown as AuthRole);

  assert.deepEqual(await getAuthSession(masterToken), { role: "master" });
  assert.deepEqual(await getAuthSession(brokerToken), { role: "broker" });
  assert.equal(await getAuthSession(legacyToken), null);
  assert.equal(await isMasterSession(masterToken), true);
  assert.equal(await isMasterSession(brokerToken), false);
});

test("broker sessions are limited to pier-manager and its required support APIs", () => {
  const allowed = [
    "/pier-manager",
    "/pier-manager/review/123",
    "/api/listingstream/active-listings",
    "/api/listingstream/intake",
    "/api/listingstream/revisions",
    "/api/listingstream/ai-draft",
    "/api/listingstream/approve-draft",
    "/api/uploads/file/flyer.pdf",
    "/api/auth/logout",
    "/login",
  ];
  const denied = ["/", "/projects", "/settings", "/api/projects", "/api/pier-pulse", "/api/activity"];

  for (const path of allowed) assert.equal(isBrokerAllowedPath(path), true, `${path} should be broker-accessible`);
  for (const path of denied) assert.equal(isBrokerAllowedPath(path), false, `${path} should be broker-restricted`);
});

test("proxy enforces broker redirects and api denials before route handlers", async () => {
  const source = await readFile("src/proxy.ts", "utf8");

  assert.match(source, /getAuthSession/);
  assert.match(source, /isBrokerAllowedPath/);
  assert.match(source, /session\.role === "broker"/);
  assert.match(source, /brokerHomePath/);
  assert.match(source, /status: 403/);
});

test("mission shell hides mission-control navigation for broker sessions", async () => {
  const source = await readFile("src/components/mission-shell.tsx", "utf8");

  assert.match(source, /getCurrentAuthSession/);
  assert.match(source, /isBroker/);
  assert.match(source, /Broker Listing Console/);
  assert.match(source, /!isBroker &&/);
});
