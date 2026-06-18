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

test("listing email html follows institutional PIER template with logo, hero, facts, CTA, and broker contact", () => {
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
      property: { zoning: { code: "I-L" }, buildingSizeSf: 26461 },
      pricing: { availableSqFt: 26461, leaseRate: "$12/SF NNN", leaseStructure: "Modified Gross" },
      brokerProfile: { name: "Joel Boblasky", email: "joel@piercommercial.com" },
    },
    listingUrl: "https://listingstream-portal.vercel.app/property/2600-louisville-road",
  });

  assert.match(html, /PIER Commercial Real Estate/);
  assert.match(html, /Brokeragetransp-1\.png/);
  assert.match(html, /role="presentation"/);
  assert.match(html, /2600 Louisville Road/);
  assert.match(html, /SPACE FOR LEASE/);
  assert.match(html, /Property Overview/);
  assert.doesNotMatch(html, /Industrial \/ Cold Storage For Lease/);
  assert.doesNotMatch(html, /SPACE FOR LEASE\s*·/i);
  assert.doesNotMatch(html, /LESASE/i);
  assert.match(html, /https:\/\/example\.com\/hero\.jpg/);
  assert.match(html, /Available SF/);
  assert.match(html, /Lease Rate/);
  assert.match(html, /Zoning/);
  assert.match(html, /±26,461 SF/);
  assert.match(html, /View PIER Listing Page/);
  assert.match(html, /listingportal\.piercommercial\.com\/property\/2600-louisville-road/);
  assert.match(html, /PIER Commercial Real Estate Brokerage/);
  assert.match(html, /joel@piercommercial\.com/);
  assert.doesNotMatch(html, /ListingStream/);
  assert.doesNotMatch(html, /listingstream/i);
  assert.doesNotMatch(html, /<script/i);
});

test("land for sale email uses land-specific price, description, highlights, map link, and property website CTA", () => {
  const html = buildMailchimpListingEmailHtml({
    listing: {
      slug: "12-w-state-street",
      title: "12 W State Street",
      propertyType: "Land For Sale",
      transactionTypes: ["sale"],
      address: { full: "12 W State Street Savannah GA", city: "Savannah", state: "GA" },
      media: { heroImageUrl: "https://example.com/land.jpg" },
      pricing: { salePrice: 1600000 },
      property: { lotSizeAcres: 2.4 },
      content: { saleDescription: "Rare infill development parcel near downtown Savannah.", saleBullets: ["Flexible zoning", "Signalized corner"] },
      mapUrl: "https://maps.google.com/?q=12+W+State+Street+Savannah+GA",
    },
    listingUrl: "https://listingstream-portal.vercel.app/property/12-w-state-street",
  });

  assert.match(html, /LAND FOR SALE/);
  assert.match(html, /Price/);
  assert.match(html, /\$1,600,000/);
  assert.match(html, /Property Overview/);
  assert.match(html, /Rare infill development parcel/);
  assert.match(html, /Highlights/);
  assert.match(html, /Flexible zoning/);
  assert.doesNotMatch(html, /Map Link/);
  assert.match(html, /View PIER Listing Page/);
  assert.doesNotMatch(html, /ListingStream/);
  assert.doesNotMatch(html, /listingstream/i);
  assert.doesNotMatch(html, /Available Spaces/);
});

test("land for sale email routes exact Land payload to land header and hides building facts", () => {
  const html = buildMailchimpListingEmailHtml({
    listing: {
      slug: "land-test-parcel",
      title: "Land Test Parcel",
      visibility: { transactionLabel: "Sale" },
      transactionTypes: ["sale"],
      property: { type: "Land", lotSizeAcres: 3.25, buildingSizeSf: 99999 },
      pricing: { salePrice: 1600000 },
      content: { saleDescription: "Development land opportunity." },
    },
    listingUrl: "https://listingstream-portal.vercel.app/property/land-test-parcel",
  });

  assert.match(html, /LAND FOR SALE/);
  assert.match(html, /LAND FOR SALE/);
  assert.match(html, /Acreage/);
  assert.match(html, /3\.25 AC/);
  assert.doesNotMatch(html, /BUILDING FOR SALE/);
  assert.doesNotMatch(html, /Building For Sale/);
  assert.doesNotMatch(html, /Building Size/);
});

test("building for sale email can include high-level financials only when toggled", () => {
  const listing = {
    slug: "fred-williams-building",
    title: "Fred Williams Building",
    propertyType: "Building For Sale",
    transactionTypes: ["sale"],
    media: { heroImageUrl: "https://example.com/building.jpg" },
    pricing: { salePrice: "$3,950,000" },
    property: { buildingSizeSf: 18750 },
    content: { saleDescription: "Historic investment property in Savannah.", highlights: ["Stabilized tenant mix"] },
    financials: { noi: 285000, capRate: "7.2%", occupancy: "94%" },
  };

  const withoutFinancials = buildMailchimpListingEmailHtml({ listing, listingUrl: "https://listingstream-portal.vercel.app/property/fred-williams-building" });
  const withFinancials = buildMailchimpListingEmailHtml({ listing, listingUrl: "https://listingstream-portal.vercel.app/property/fred-williams-building", includeFinancials: true });

  assert.match(withFinancials, /BUILDING FOR SALE/);
  assert.match(withFinancials, /Total SF/);
  assert.match(withFinancials, /±18,750 SF/);
  assert.match(withFinancials, /NOI/);
  assert.match(withFinancials, /\$285,000/);
  assert.match(withFinancials, /Cap Rate/);
  assert.doesNotMatch(withoutFinancials, /High-Level Financials/);
});

test("space for lease email renders lease rate and available spaces table", () => {
  const html = buildMailchimpListingEmailHtml({
    listing: {
      slug: "whitemarsh-plaza-suite-200",
      title: "Whitemarsh Plaza",
      propertyType: "Space For Lease",
      transactionTypes: ["lease"],
      media: { heroImageUrl: "https://example.com/lease.jpg" },
      pricing: { leaseRate: "$24/SF NNN" },
      content: { leaseDescription: "Retail space in an established Whitemarsh Island center." },
      spaces: [
        { suiteNumber: "200", sizeSf: 2500, leaseRate: "$24/SF NNN", notes: "Second-generation retail" },
        { suiteNumber: "310", sizeSf: 1200, leaseRate: "$22/SF NNN" },
      ],
    },
    listingUrl: "https://listingstream-portal.vercel.app/property/whitemarsh-plaza-suite-200",
  });

  assert.match(html, /SPACE FOR LEASE/);
  assert.match(html, /Lease Rate/);
  assert.match(html, /\$24\/SF NNN/);
  assert.match(html, /Highlights/);
  assert.match(html, /View PIER Listing Page/);
  assert.doesNotMatch(html, /ListingStream/);
});

test("mission control exposes direct API email blast controls in UI/auth", async () => {
  const componentSource = await readFile("src/components/pier-manager-listing-console.tsx", "utf8");
  const authSource = await readFile("src/lib/auth.ts", "utf8");

  assert.match(componentSource, /Email Blast/);
  assert.match(componentSource, /\/api\/listingstream\/mailchimp\/lists/);
  assert.match(componentSource, /\/api\/listingstream\/mailchimp\/campaigns/);
  assert.match(componentSource, /Audience Selector/);
  assert.match(componentSource, /Create Embedded Draft Preview/);
  assert.match(componentSource, /mailchimp-embedded-preview/);
  assert.match(componentSource, /Send Broker Smoke Test/);
  assert.match(componentSource, /Deploy to Selected List/);
  assert.match(componentSource, /includeFinancials/);
  assert.match(authSource, /\/api\/listingstream\//);
});
