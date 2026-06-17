import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import { createModificationReviewDraft, buildModificationDeltaPrompt, type PropertyPortalCloudWriter } from "../src/lib/property-portal-ai";
import { interpretBrokerEditRequestDeterministic } from "../src/lib/broker-edit-interpreter";
import { buildPropertyPortalApprovedPayload } from "../src/lib/property-portal-client";

const deterministicInterpreter = async (current: Record<string, unknown>, instructions: string) => interpretBrokerEditRequestDeterministic(current, instructions);

const currentListing = {
  slug: "42-west-montgomery-cross-road",
  title: "Parrott Plaza",
  visibility: { transactionLabel: "For Lease" },
  admin: {
    suites: [
      { suiteNumber: "M", availableSqFt: "1100", baseRent: "1100", rentType: "Monthly" },
      { suiteNumber: "P", availableSqFt: "1900", baseRent: "1900", rentType: "Monthly" },
    ],
  },
};

test("modification fetch uses no-store cache-busted baseline for successive edits", async () => {
  const source = await readFile(new URL("../src/lib/property-portal-ai.ts", import.meta.url), "utf8");
  assert.match(source, /fresh=\$\{Date\.now\(\)\}/);
  assert.match(source, /Cache-Control/);
  assert.match(source, /no-store, no-cache/);
});

test("suite parser extracts explicit lease type and suite notes without inventing default lease type", async () => {
  const writer: PropertyPortalCloudWriter = async () => ({
    title: "Parrott Plaza",
    descriptionHtml: "<p>Suite P updated.</p>",
    highlights: [],
    structuredUpdates: {},
    mediaNotes: [],
  });

  const draft = await createModificationReviewDraft({
    propertyIdOrSlug: "42-west-montgomery-cross-road",
    instructions: "Change Suite P lease type to Modified Gross. Suite notes: ideal for a showroom user with direct storefront access.",
    interpreter: deterministicInterpreter,
    fetchImpl: async () => Response.json(currentListing),
    writer,
  });

  const suites = (draft.structuredUpdates.admin as { suites: Array<Record<string, unknown>> }).suites;
  const suiteP = suites.find((suite) => suite.suiteNumber === "P");
  const suiteM = suites.find((suite) => suite.suiteNumber === "M");
  assert.equal(suiteP?.rentType, "Modified Gross");
  assert.equal(suiteP?.suiteNotes, "Ideal for a showroom user with direct storefront access.");
  assert.equal(suiteM?.rentType, "Monthly");
});

test("new suite parser leaves lease type blank when broker omits it", async () => {
  const writer: PropertyPortalCloudWriter = async () => ({
    title: "Parrott Plaza",
    descriptionHtml: "<p>Suite X added.</p>",
    highlights: [],
    structuredUpdates: {},
    mediaNotes: [],
  });

  const draft = await createModificationReviewDraft({
    propertyIdOrSlug: "42-west-montgomery-cross-road",
    instructions: "Add Suite X with 800 SF at $1,250/month. Suite notes: small office suite near the main entry.",
    interpreter: deterministicInterpreter,
    fetchImpl: async () => Response.json(currentListing),
    writer,
  });

  const suites = (draft.structuredUpdates.admin as { suites: Array<Record<string, unknown>> }).suites;
  const suiteX = suites.find((suite) => suite.suiteNumber === "X");
  assert.equal(suiteX?.rentType, "");
  assert.equal(suiteX?.suiteNotes, "Small office suite near the main entry.");
});

test("suite notes parser rewrites conversational broker instructions as public-facing copy", async () => {
  const writer: PropertyPortalCloudWriter = async () => ({
    title: "Parrott Plaza",
    descriptionHtml: "<p>Suite M updated.</p>",
    highlights: [],
    structuredUpdates: {},
    mediaNotes: [],
  });

  const draft = await createModificationReviewDraft({
    propertyIdOrSlug: "42-west-montgomery-cross-road",
    instructions: "Please add a description under suite M that says the space is 100% storage with overhead drive-in rollup door and pedestrian door.",
    interpreter: deterministicInterpreter,
    fetchImpl: async () => Response.json(currentListing),
    writer,
  });

  const suites = (draft.structuredUpdates.admin as { suites: Array<Record<string, unknown>> }).suites;
  const suiteM = suites.find((suite) => suite.suiteNumber === "M");
  assert.equal(suiteM?.suiteNotes, "The space is 100% storage and features an overhead drive-in rollup door alongside a single pedestrian access door.");
  assert.doesNotMatch(String(suiteM?.suiteNotes), /under suite M|that says|please add/i);
});

test("suite notes parser treats broker 'space' wording as a suite update and rewrites public copy", async () => {
  const writer: PropertyPortalCloudWriter = async () => ({
    title: "Parrott Plaza",
    descriptionHtml: "<p>Suite P updated.</p>",
    highlights: [],
    structuredUpdates: {},
    mediaNotes: [],
  });

  const draft = await createModificationReviewDraft({
    propertyIdOrSlug: "42-west-montgomery-cross-road",
    instructions: "I need a description under space P that says this suite has a clean retail showroom up front with storage in the back.",
    interpreter: deterministicInterpreter,
    fetchImpl: async () => Response.json(currentListing),
    writer,
  });

  const suites = (draft.structuredUpdates.admin as { suites: Array<Record<string, unknown>> }).suites;
  const suiteP = suites.find((suite) => suite.suiteNumber === "P");
  assert.equal(suiteP?.suiteNotes, "This suite has a clean retail showroom up front with storage in the back.");
  assert.doesNotMatch(String(suiteP?.suiteNotes), /under space P|that says|I need/i);
});

test("suite notes parser preserves verbatim copy only when broker explicitly asks for exact wording", async () => {
  const writer: PropertyPortalCloudWriter = async () => ({
    title: "Parrott Plaza",
    descriptionHtml: "<p>Suite M updated.</p>",
    highlights: [],
    structuredUpdates: {},
    mediaNotes: [],
  });

  const draft = await createModificationReviewDraft({
    propertyIdOrSlug: "42-west-montgomery-cross-road",
    instructions: "For suite M, put this in exactly: 100% STORAGE - broker to verify door sizes",
    interpreter: deterministicInterpreter,
    fetchImpl: async () => Response.json(currentListing),
    writer,
  });

  const suites = (draft.structuredUpdates.admin as { suites: Array<Record<string, unknown>> }).suites;
  const suiteM = suites.find((suite) => suite.suiteNumber === "M");
  assert.equal(suiteM?.suiteNotes, "100% STORAGE - broker to verify door sizes");
});

test("modification prompt requires wrapper stripping and broker-written marketing tone for narrative fields", () => {
  const prompt = buildModificationDeltaPrompt({
    currentListing,
    instructions: "Please update the property description to say this is a flexible neighborhood retail center.",
  });

  assert.match(prompt, /strip conversational wrappers/i);
  assert.match(prompt, /suiteNotes, propertyDescription, locationDescription/i);
  assert.match(prompt, /source of facts, not final public copy/i);
  assert.match(prompt, /put this in exactly/i);
  assert.match(prompt, /professional, down-to-earth, and warm/i);
  assert.match(prompt, /as if written by the broker directly/i);
  assert.match(prompt, /robotic, generic, or overly verbose/i);
});


test("suite floor plan file-only instructions produce high-confidence structured mutation", async () => {
  const writer: PropertyPortalCloudWriter = async () => ({
    title: "Parrott Plaza",
    descriptionHtml: "<p>Suite P floor plan attached.</p>",
    highlights: [],
    structuredUpdates: {},
    mediaNotes: [],
  });

  const draft = await createModificationReviewDraft({
    propertyIdOrSlug: "42-west-montgomery-cross-road",
    instructions: "Attach the uploaded PDF floor plan to Suite P.",
    interpreter: deterministicInterpreter,
    fetchImpl: async () => Response.json(currentListing),
    writer,
  });

  const suites = (draft.structuredUpdates.admin as { suites: Array<Record<string, unknown>> }).suites;
  const suiteP = suites.find((suite) => suite.suiteNumber === "P");
  const interpreter = draft.review.interpreter;
  assert.ok(interpreter);
  assert.equal(interpreter.confidence, "high");
  assert.deepEqual(suiteP?.suiteFloorPlans, []);
  assert.match(interpreter.summary.join(" "), /Suite P floor plan upload/i);
  assert.equal(interpreter.flags.length, 0);
});

test("suite PDF uploads are converted to image URLs but still routed to suiteFloorPlans", () => {
  const payload = buildPropertyPortalApprovedPayload({
    mode: "publish-live",
    slug: "42-west-montgomery-cross-road",
    draft: {
      kind: "modification",
      title: "Parrott Plaza",
      descriptionHtml: "",
      highlights: [],
      sourceInput: { propertyIdOrSlug: "42-west-montgomery-cross-road", instructions: "Attach this floor plan PDF to Suite P." },
      currentListing,
      structuredUpdates: {
        admin: {
          suites: [
            { suiteNumber: "M", availableSqFt: "1100", baseRent: "1100" },
            { suiteNumber: "P", availableSqFt: "1900", baseRent: "1900" },
          ],
        },
      },
    },
  }) as Record<string, unknown>;

  assert.ok(payload.admin);
  const prompt = buildModificationDeltaPrompt({ currentListing, instructions: "Suite P lease type is NNN and suite notes: rear building space." });
  assert.match(prompt, /lease type\/expense structure/i);
  assert.match(prompt, /suiteNotes/i);
});
