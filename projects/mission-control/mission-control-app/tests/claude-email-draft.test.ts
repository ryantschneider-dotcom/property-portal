import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  buildClaudeEmailDraftPrompt,
  buildEmailDraftSourcePacket,
  normalizeClaudeEmailDraft,
  runClaudeEmailDraft,
} from "../src/lib/claude-email-draft";

test("Claude email source packet strips raw/internal database fields and carries PIER brand rules", () => {
  const packet = buildEmailDraftSourcePacket({
    listing: {
      id: "internal-id",
      slug: "42-west-montgomery",
      title: "42 West Montgomery Cross Road",
      address: { street: "42 W Montgomery Cross Rd", city: "Savannah", state: "GA" },
      content: {
        verifiedHighlight: "Very affordable",
        propertyDescription: "Freestanding commercial building near Abercorn Street.",
      },
      admin: { internalNotes: "Do not show this" },
      commission: "do not show",
      pricing: { leaseRate: "$18/SF/YR", availableSqFt: 6542 },
      media: { images: [{ urls: { large: "https://example.com/hero.jpg" } }] },
    },
    audience: "medical tenants and owner-users",
    campaignGoal: "new listing announcement",
    broker: { name: "Ryan T. Schneider, CCIM", email: "ryan@piercommercial.com", phone: "912.239.6298" },
  });

  const serialized = JSON.stringify(packet);
  assert.equal(packet.brandRules.primaryColor, "#CB521E");
  assert.equal(packet.brandRules.publicVoice, "Ryan T. Schneider, CCIM");
  assert.match(packet.brandRules.logoUrl, /Brokeragetransp\.png/);
  assert.equal(packet.brandRules.noLogoRecreation, true);
  assert.equal(packet.brandRules.noLogoCssFilters, true);
  assert.equal(packet.campaign.audience, "medical tenants and owner-users");
  assert.equal(packet.listing.publicFacts.title, "42 West Montgomery Cross Road");
  assert.deepEqual(packet.listing.photos, ["https://example.com/hero.jpg"]);
  assert.doesNotMatch(serialized, /Very affordable|internalNotes|verifiedHighlight/i);
  assert.doesNotMatch(serialized, /"commission"\s*:/i);
});

test("Claude prompt requires complete Mailchimp-safe JSON draft and forbids raw ListingStream labels", () => {
  const packet = buildEmailDraftSourcePacket({ listing: { title: "42 West Montgomery", pricing: { leaseRate: "$18/SF/YR" } } });
  const prompt = buildClaudeEmailDraftPrompt(packet);

  assert.match(prompt, /Claude is the email strategist, designer, writer, and HTML builder/i);
  assert.match(prompt, /subjectLines/i);
  assert.match(prompt, /emailHtml/i);
  assert.match(prompt, /plainText/i);
  assert.match(prompt, /Mailchimp-compatible/i);
  assert.match(prompt, /Brokeragetransp\.png/i);
  assert.match(prompt, /Do not recreate the PIER logo/i);
  assert.match(prompt, /Never apply CSS filters/i);
  assert.match(prompt, /Do not use raw ListingStream/i);
  assert.match(prompt, /noPrivateContent/i);
});

test("Claude email draft normalizer validates strategic draft output", () => {
  const draft = normalizeClaudeEmailDraft({
    subjectLines: ["42 West Montgomery | Move-in ready Savannah space", "Southside Savannah lease opportunity"],
    previewText: "Freestanding commercial space near Abercorn Street.",
    campaignStrategy: "Lead with location and ready occupancy.",
    emailHtml: "<!doctype html><html><body><img src=\"https://missioncontrol.piercommercial.com/assets/Brokeragetransp.png\" alt=\"PIER Commercial Real Estate\"><h1>42 West Montgomery</h1><a href=\"https://piercommercial.com\">View Property Website</a></body></html>",
    plainText: "42 West Montgomery\nView Property Website: https://piercommercial.com",
    ctaText: "View Property Website",
    designNotes: "Dark header, orange CTA, clean mobile stack.",
    complianceChecklist: { noPrivateContent: true, noRawFieldLabels: true, listingUrlIncluded: true, brokerContactIncluded: true },
  });

  assert.equal(draft.subjectLines.length, 2);
  assert.equal(draft.complianceChecklist.noRawFieldLabels, true);
  assert.match(draft.emailHtml, /Brokeragetransp\.png/);
  assert.match(draft.emailHtml, /View Property Website/);
});

test("Claude email normalizer rejects faux or filtered PIER logos", () => {
  const baseDraft = {
    subjectLines: ["42 West Montgomery | Move-in ready Savannah space"],
    previewText: "Freestanding commercial space near Abercorn Street.",
    campaignStrategy: "Lead with location and ready occupancy.",
    plainText: "42 West Montgomery\nView Property Website: https://piercommercial.com",
    ctaText: "View Property Website",
    designNotes: "Dark header, orange CTA, clean mobile stack.",
    complianceChecklist: { noPrivateContent: true, noRawFieldLabels: true, listingUrlIncluded: true, brokerContactIncluded: true },
  };

  assert.throws(() => normalizeClaudeEmailDraft({
    ...baseDraft,
    emailHtml: "<!doctype html><html><body><div class=\"pier-logo-square\">P</div><div>I</div><div>E</div><div>R</div><h1>42 West Montgomery</h1></body></html>",
  }), /official Brokeragetransp\.png|recreate or CSS-filter/);

  assert.throws(() => normalizeClaudeEmailDraft({
    ...baseDraft,
    emailHtml: "<!doctype html><html><body><img src=\"https://missioncontrol.piercommercial.com/assets/Brokeragetransp.png\" style=\"filter:invert(1)\"><h1>42 West Montgomery</h1></body></html>",
  }), /recreate or CSS-filter/);
});

test("Claude provider runner posts to Anthropic messages API and parses JSON text", async () => {
  const calls: Array<{ url: string; body: any; headers: Record<string, string> }> = [];
  const draft = await runClaudeEmailDraft({
    packet: buildEmailDraftSourcePacket({ listing: { title: "Test Listing" } }),
    apiKey: "test-key",
    fetchImpl: async (url: string | URL | Request, init?: RequestInit) => {
      calls.push({ url: String(url), body: JSON.parse(String(init?.body || "{}")), headers: init?.headers as Record<string, string> });
      return new Response(JSON.stringify({
        content: [{ type: "text", text: JSON.stringify({
          subjectLines: ["Test Listing | PIER Commercial"],
          previewText: "A focused PIER listing update.",
          campaignStrategy: "Lead with the property-specific hook.",
          emailHtml: "<!doctype html><html><body><img src=\"https://missioncontrol.piercommercial.com/assets/Brokeragetransp.png\" alt=\"PIER Commercial Real Estate\"><h1>Test Listing</h1><a href=\"https://piercommercial.com\">View Property Website</a></body></html>",
          plainText: "Test Listing\nView Property Website: https://piercommercial.com",
          ctaText: "View Property Website",
          designNotes: "PIER email layout.",
          complianceChecklist: { noPrivateContent: true, noRawFieldLabels: true, listingUrlIncluded: true, brokerContactIncluded: true },
        }) }],
      }), { status: 200, headers: { "content-type": "application/json" } });
    },
  });

  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "https://api.anthropic.com/v1/messages");
  assert.equal(calls[0].headers["x-api-key"], "test-key");
  assert.match(calls[0].body.messages[0].content, /Test Listing/);
  assert.equal(draft.subjectLines[0], "Test Listing | PIER Commercial");
});

test("PIER Manager UI exposes Claude-first email draft review before Mailchimp creation", () => {
  const source = readFileSync("src/components/pier-manager-listing-console.tsx", "utf8");
  const route = readFileSync("src/app/api/listingstream/mailchimp/campaigns/route.ts", "utf8");

  assert.match(source, /Generate Claude Email Draft/);
  assert.match(source, /mailchimpClaudeDraft/);
  assert.match(source, /Claude Strategy/);
  assert.match(source, /Create Mailchimp Draft from Approved Claude Email/);
  assert.match(route, /generate-claude-draft/);
  assert.match(route, /runClaudeEmailDraft/);
});
