import test from "node:test";
import assert from "node:assert/strict";

import { hydrateMailchimpListingPayload } from "../src/app/api/listingstream/mailchimp/campaigns/route";

test("mailchimp campaign creation hydrates active-listing summary with full ListingStream property payload", async () => {
  const calls: string[] = [];
  const hydrated = await hydrateMailchimpListingPayload(
    { id: "42-west-montgomery-cross-road", slug: "42-west-montgomery-cross-road", title: "Parrott Plaza" },
    (async (url: RequestInfo | URL) => {
      calls.push(String(url));
      return new Response(JSON.stringify({
        id: "42-west-montgomery-cross-road",
        slug: "42-west-montgomery-cross-road",
        title: "Parrott Plaza",
        media: { images: [{ url: "https://s3.amazonaws.com/buildout-production/datas/29775421/5940bb0a6dc7a7f566d8253421eba93578defee5/full.jpg?1714758398" }] },
        content: { leaseDescription: "Live property description", locationDescription: "Live location description", leaseBullets: ["Great parking"] },
        admin: { suites: [{ suiteNumber: "P", availableSqFt: "1900", baseRent: "1900", rentType: "Plus Utilities" }] },
      }), { status: 200, headers: { "content-type": "application/json" } });
    }) as typeof fetch,
  );

  assert.equal(calls.length, 1);
  assert.match(calls[0], /\/api\/properties\/42-west-montgomery-cross-road$/);
  assert.deepEqual((hydrated.media as any).images[0].url, "https://s3.amazonaws.com/buildout-production/datas/29775421/5940bb0a6dc7a7f566d8253421eba93578defee5/full.jpg?1714758398");
  assert.equal((hydrated.content as any).leaseDescription, "Live property description");
  assert.equal((hydrated.admin as any).suites[0].suiteNumber, "P");
});
