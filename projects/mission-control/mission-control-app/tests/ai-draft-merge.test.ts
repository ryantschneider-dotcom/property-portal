import test from "node:test";
import assert from "node:assert/strict";

import { mergeResearchDraftIntoModificationDraft } from "../src/app/api/listingstream/ai-draft/route";

test("modification enrichment merge preserves broker hand-edited propertyDescription", () => {
  const brokerEditedDescription = "Broker hand-edited copy: keep this exact public property description.";
  const modificationDraft: any = {
    currentListing: {
      title: "Bush Road Development Site",
      content: {
        propertyDescription: brokerEditedDescription,
      },
    },
    structuredUpdates: {
      content: {
        propertyDescription: brokerEditedDescription,
        marketContext: "Broker-approved market context.",
      },
    },
    review: {
      checklist: {
        needsManualInput: [],
      },
    },
  };
  const researchDraft: any = {
    structuredUpdates: {
      content: {
        propertyDescription: "Research rewrite that must not replace the broker edit.",
        marketContext: "Research market context may merge when no broker copy conflicts.",
        structuredFacts: {
          wetlands: "per owner-commissioned delineation submitted to USACE",
        },
      },
      meta: {
        researchDraft: {
          reviewFlags: ["Attach wetlands delineation before document-verified publication."],
        },
      },
    },
  };

  const merged = mergeResearchDraftIntoModificationDraft(modificationDraft, researchDraft, "wetlands note");
  const content = merged.structuredUpdates.content as Record<string, unknown>;

  assert.equal(content.propertyDescription, brokerEditedDescription);
  assert.deepEqual(content.structuredFacts, { wetlands: "per owner-commissioned delineation submitted to USACE" });
  assert.equal((merged.structuredUpdates.meta as Record<string, unknown>).listingRevisionResearchMerged, true);
});
