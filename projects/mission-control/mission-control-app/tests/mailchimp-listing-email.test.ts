import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import {
  buildMailchimpCampaignSettings,
  buildMailchimpListingEmailHtml,
  deriveMailchimpDefaultsFromListing,
  getMailchimpServerPrefix,
  normalizeMailchimpLists,
} from "../src/lib/mailchimp-listing-email";

test("mailchimp server prefix is derived from api key suffix or explicit env", () => {
  assert.equal(getMailchimpServerPrefix({ MAILCHIMP_API_KEY: "abc123-us1" }), "us1");
  assert.equal(getMailchimpServerPrefix({ MAILCHIMP_API_KEY: "abc123-us1", MAILCHIMP_SERVER_PREFIX: "us22" }), "us22");
  assert.equal(getMailchimpServerPrefix({ MAILCHIMP_API_KEY: "abc123" }), "");
});

test("mailchimp list normalization keeps only usable audience choices", () => {
  const lists = normalizeMailchimpLists({
    lists: [
      { id: "e0ab276d58", name: "PIER Brokers", stats: { member_count: 418 } },
      { id: "", name: "Broken" },
      { id: "abc", name: "" },
    ],
  });

  assert.deepEqual(lists, [{ id: "e0ab276d58", name: "PIER Brokers", memberCount: 418 }]);
});

test("selected listing generates subject/from/list settings without allowing sends", () => {
  const listing = {
    slug: "2600-louisville-road",
    title: "2600 Louisville Road",
    address: { city: "Savannah", state: "GA" },
    visibility: { transactionLabel: "For Lease" },
    brokerProfile: { name: "Joel Boblasky", email: "joel@piercommercial.com" },
  };
  const defaults = deriveMailchimpDefaultsFromListing(listing);
  const settings = buildMailchimpCampaignSettings({
    listing,
    listId: "e0ab276d58",
    subjectLine: defaults.subjectLine,
    fromName: defaults.fromName,
    replyTo: defaults.replyTo,
  });

  assert.equal(settings.type, "regular");
  assert.equal(settings.recipients.list_id, "e0ab276d58");
  assert.equal(settings.settings.subject_line, "2600 Louisville Road | For Lease | Savannah, GA");
  assert.equal(settings.settings.from_name, "Joel Boblasky");
  assert.equal(settings.settings.reply_to, "joel@piercommercial.com");
  assert.equal("send" in settings, false);
});

test("listing email html follows PIER Mailchimp baseline with hero, facts, CTA, and broker contact", () => {
  const html = buildMailchimpListingEmailHtml({
    listing: {
      slug: "2600-louisville-road",
      title: "2600 Louisville Road",
      address: { full: "2600 Louisville Road Savannah GA", city: "Savannah", state: "GA" },
      visibility: { transactionLabel: "Industrial / Cold Storage For Lease" },
      media: { heroImageUrl: "https://example.com/hero.jpg" },
      content: {
        marketingBlurb: "Purpose-built cold storage opportunity in Savannah.",
        leaseDescription: "Two refrigerated spaces totaling ±26,461 SF with dock-high loading.",
        leaseBullets: ["Four dock-high loading doors", "High-bay clear heights up to 28 feet"],
      },
      pricing: { availableSqFt: 26461, leaseStructure: "Modified Gross" },
      brokerProfile: { name: "Joel Boblasky", email: "joel@piercommercial.com" },
    },
    listingUrl: "https://listingstream-portal.vercel.app/property/2600-louisville-road",
  });

  assert.match(html, /PIER Commercial Real Estate/);
  assert.match(html, /2600 Louisville Road/);
  assert.match(html, /Industrial \/ Cold Storage For Lease/);
  assert.match(html, /https:\/\/example\.com\/hero\.jpg/);
  assert.match(html, /Total Available/);
  assert.match(html, /±26,461 SF/);
  assert.match(html, /View Listing Details/);
  assert.match(html, /joel@piercommercial\.com/);
  assert.doesNotMatch(html, /<script/i);
});

test("mission control exposes broker-safe mailchimp list and draft routes in UI/auth", async () => {
  const componentSource = await readFile("src/components/pier-manager-listing-console.tsx", "utf8");
  const authSource = await readFile("src/lib/auth.ts", "utf8");

  assert.match(componentSource, /Mailchimp Email Draft/);
  assert.match(componentSource, /\/api\/listingstream\/mailchimp\/lists/);
  assert.match(componentSource, /\/api\/listingstream\/mailchimp\/campaign-draft/);
  assert.match(componentSource, /Subject Line/);
  assert.match(componentSource, /From Name/);
  assert.match(componentSource, /From Email/);
  assert.match(authSource, /\/api\/listingstream\//);
});
