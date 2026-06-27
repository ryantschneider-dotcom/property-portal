import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { runListingResearchAndDraft } from "../src/lib/listing-research-orchestrator";

test("research orchestrator writes dossier and returns distinct Claude-written narratives", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "pier-dossier-"));
  try {
    const draft = await runListingResearchAndDraft({
      input: {
        listingTitle: "Bush Road Development Site",
        addressStreet: "0 Bush Road",
        city: "Savannah",
        state: "GA",
        parcelId: "11026 02007",
        latitude: "32.043014",
        longitude: "-81.294012",
        unpriced: true,
      },
      dataRoot: root,
      mirrorToFirebase: false,
      researchers: {
        claudeResearch: async () => ({
          facts: { zoning: "PUD-C", acreageOrSF: "4.8 acres" },
          nearbyAnchors: [{ name: "I-16", type: "Interstate", distance: "about 3 miles", direction: "north" }],
          marketEvents: [{ title: "West Chatham infrastructure project", type: "road", status: "funded", date: "2026", whyItMatters: "Improves access", url: "https://example.com/road" }],
          sources: [{ claim: "4.8-acre site", url: "https://example.com/assessor", note: "County record", confidence: "high" }],
          gaps: [],
        }),
        openaiValidate: async () => ({ keep: [], soften: [], remove: [] }),
        claudeWrite: async ({ dossier }) => ({
          title: "Bush Road Development Site",
          propertyDescription: "<p>PROPERTY: 4.8-acre commercial land position.</p>",
          locationDescription: "<p>LOCATION: access-oriented Bush Road positioning.</p>",
          neighborhoodDescription: "<p>NEIGHBORHOOD: West Chatham growth corridor users.</p>",
          marketContext: "<p>MARKET: infrastructure momentum supports development optionality.</p>",
          highlights: ["4.8-acre site"],
          dealDrivers: ["West Chatham growth path"],
          nearbyAnchors: dossier.nearbyAnchors.map((anchor) => ({ name: anchor.name, type: anchor.type, distance: anchor.distance })),
          verifiedFacts: { parcelId: "11026 02007", acreageOrSF: "4.8 acres", zoning: "PUD-C", permittedUses: null, utilities: null, floodZone: null, lastSale: null, trafficCounts: null, driveTimes: null },
          sources: dossier.sources,
          reviewFlags: [],
          confidenceOverall: "medium",
          mediaNotes: "Add aerial and road frontage photos.",
        }),
      },
    });

    assert.equal(draft.title, "Bush Road Development Site");
    const content = draft.structuredUpdates.content as Record<string, any>;
    assert.equal(content.propertyDescription, "<p>PROPERTY: 4.8-acre commercial land position.</p>");
    assert.equal(content.locationDescription, "<p>LOCATION: access-oriented Bush Road positioning.</p>");
    assert.equal(content.neighborhoodDescription, "<p>NEIGHBORHOOD: West Chatham growth corridor users.</p>");
    assert.equal(content.marketContext, "<p>MARKET: infrastructure momentum supports development optionality.</p>");
    assert.notEqual(content.propertyDescription, content.locationDescription);
    assert.equal((draft.structuredUpdates.property as Record<string, unknown>).parcelId, "11026 02007");
    assert.match(String(draft.sourceInput.dossierPath), /dossier\.json$/);

    const dossierRaw = await readFile(String(draft.sourceInput.dossierPath), "utf8");
    const dossier = JSON.parse(dossierRaw);
    assert.equal(dossier.resolved.lat, 32.043014);
    assert.equal(dossier.resolved.lng, -81.294012);
    assert.equal(dossier.providers.claude, true);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("research orchestrator completes with review flag when Claude research fails", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "pier-dossier-fail-"));
  try {
    const draft = await runListingResearchAndDraft({
      input: { listingTitle: "Bush Road", addressStreet: "0 Bush Road", city: "Savannah", state: "GA" },
      dataRoot: root,
      mirrorToFirebase: false,
      researchers: {
        claudeResearch: async () => { throw new Error("provider unavailable"); },
        openaiValidate: async () => ({ keep: [], soften: [], remove: [] }),
        claudeWrite: async ({ dossier }) => ({
          title: "Bush Road",
          propertyDescription: "<p>Property copy from intake only.</p>",
          locationDescription: "<p>Location copy from intake only.</p>",
          neighborhoodDescription: "<p>Neighborhood requires confirmation.</p>",
          marketContext: "<p>Market context requires confirmation.</p>",
          highlights: [],
          dealDrivers: [],
          nearbyAnchors: [],
          verifiedFacts: { parcelId: null, acreageOrSF: null, zoning: null, permittedUses: null, utilities: null, floodZone: null, lastSale: null, trafficCounts: null, driveTimes: null },
          sources: [],
          reviewFlags: dossier.gaps,
          confidenceOverall: "low",
          mediaNotes: "Provider failed.",
        }),
      },
    });

    assert.equal(draft.review.checklist.needsManualInput.some((item) => /Claude research failed/i.test(item)), true);
    assert.equal(((draft.structuredUpdates.meta as Record<string, any>).researchDossier.providers.claude), false);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("research orchestrator carries broker-submitted wetlands status into dossier before write", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "pier-dossier-wetlands-"));
  try {
    let writeDossier: any = null;
    const draft = await runListingResearchAndDraft({
      input: {
        listingTitle: "Bush Road Development Site",
        addressStreet: "0 Bush Road",
        city: "Savannah",
        state: "GA",
        parcelId: "11026 02007",
        rawNotes: "Owner completed wetlands delineation and submitted it to the Army Corps of Engineers. Wetlands are isolated / non-jurisdictional, no Section 404 permit required, normal municipal land-disturbance process applies.",
        unpriced: true,
      },
      dataRoot: root,
      mirrorToFirebase: false,
      researchers: {
        claudeResearch: async () => ({ facts: {}, sources: [], gaps: [] }),
        manusResearch: async () => ({ facts: { acreageOrSF: "not confirmed" }, sources: [], gaps: ["assessor blocked"] }),
        openaiValidate: async () => ({ keep: [], soften: [], remove: [] }),
        claudeWrite: async ({ dossier }) => {
          writeDossier = dossier;
          return {
            title: "Bush Road Development Site",
            propertyDescription: "<p>Broker-confirmed wetlands status supports development optionality.</p>",
            locationDescription: "<p>Bush Road location.</p>",
            neighborhoodDescription: "<p>West Chatham corridor.</p>",
            marketContext: "<p>Development activity continues nearby.</p>",
            highlights: ["Broker-reported wetlands diligence complete"],
            dealDrivers: ["No federal Section 404 permit reported"],
            nearbyAnchors: [],
            verifiedFacts: { parcelId: "11026 02007", acreageOrSF: null, zoning: null, permittedUses: null, utilities: null, floodZone: null, lastSale: null, trafficCounts: null, driveTimes: null, wetlands: String(dossier.facts.wetlands || "") },
            sources: dossier.sources,
            reviewFlags: dossier.gaps,
            confidenceOverall: "medium",
            mediaNotes: "Attach wetlands delineation.",
          };
        },
      },
    });

    assert.match(String(writeDossier?.facts?.wetlands), /isolated \/ non-jurisdictional/i);
    assert.match(String(writeDossier?.facts?.wetlands), /no federal Section 404 permit required/i);
    assert.equal(writeDossier.sources.some((source: any) => /Broker-attested wetlands status per owner-commissioned delineation submitted to USACE/i.test(String(source.claim))), true);
    assert.equal(draft.review.checklist.needsManualInput.some((item) => /delineation and (USACE|Army Corps) correspondence/i.test(item)), true);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
