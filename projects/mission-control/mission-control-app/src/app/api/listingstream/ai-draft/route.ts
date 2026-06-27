import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { AUTH_COOKIE, isValidAuthToken } from "@/lib/auth";
import { runListingResearchAndDraft } from "@/lib/listing-research-orchestrator";
import { createModificationReviewDraft, reviseBrokerReviewDraft, type BrokerReviewDraft } from "@/lib/property-portal-ai";
import { createPropertyPortalProxyError, withPropertyPortalTimeout } from "@/lib/property-portal-client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const AI_DRAFT_ROUTE_TIMEOUT_MS = Number(process.env.PIER_MANAGER_AI_DRAFT_ROUTE_TIMEOUT_MS ?? 240_000);

type AiDraftRequest =
  | {
      mode: "new-listing";
      input: {
        address: string;
        basicSpecs: string;
        priceContext?: string;
        unpriced?: boolean;
        rawNotes: string;
      };
    }
  | {
      mode: "modification";
      propertyIdOrSlug: string;
      instructions: string;
    }
  | {
      mode: "revise";
      draft: BrokerReviewDraft;
      feedback: string;
    };


export function mergeResearchDraftIntoModificationDraft(modificationDraft: BrokerReviewDraft, researchDraft: Awaited<ReturnType<typeof runListingResearchAndDraft>>, instructions: string): BrokerReviewDraft {
  const current = (modificationDraft.currentListing || {}) as Record<string, unknown>;
  const currentContent = ((current.content && typeof current.content === "object") ? current.content : {}) as Record<string, unknown>;
  const researchUpdates = (researchDraft.structuredUpdates || {}) as Record<string, unknown>;
  const researchContent = ((researchUpdates.content && typeof researchUpdates.content === "object") ? researchUpdates.content : {}) as Record<string, unknown>;
  const existingUpdates = (modificationDraft.structuredUpdates || {}) as Record<string, unknown>;
  const existingContent = ((existingUpdates.content && typeof existingUpdates.content === "object") ? existingUpdates.content : {}) as Record<string, unknown>;
  const mergedContent = {
    ...researchContent,
    ...existingContent,
    propertyDescription: existingContent.propertyDescription ?? currentContent.propertyDescription ?? current.propertyDescription ?? researchContent.propertyDescription,
    descriptionHtml: existingContent.descriptionHtml ?? currentContent.descriptionHtml ?? current.descriptionHtml ?? researchContent.descriptionHtml,
    saleDescription: existingContent.saleDescription ?? currentContent.saleDescription ?? current.saleDescription ?? researchContent.saleDescription,
  };
  const meta = {
    ...(((researchUpdates.meta && typeof researchUpdates.meta === "object") ? researchUpdates.meta : {}) as Record<string, unknown>),
    ...(((existingUpdates.meta && typeof existingUpdates.meta === "object") ? existingUpdates.meta : {}) as Record<string, unknown>),
    listingRevisionResearchMerged: true,
    brokerRevisionNotes: instructions,
  };
  const reviewFlags = Array.from(new Set([
    ...(((researchUpdates.meta as Record<string, unknown> | undefined)?.researchDraft as Record<string, unknown> | undefined)?.reviewFlags as string[] || []),
    ...(((existingUpdates.reviewFlags && typeof existingUpdates.reviewFlags === "object") ? ((existingUpdates.reviewFlags as Record<string, unknown>).needsManualInput as string[] || []) : [])),
    "Broker-attested facts must remain attributed as per owner-commissioned delineation submitted to USACE until the document is attached.",
  ].filter(Boolean)));
  return {
    ...modificationDraft,
    structuredUpdates: {
      ...researchUpdates,
      ...existingUpdates,
      content: mergedContent,
      meta,
      reviewFlags: { ...(((existingUpdates.reviewFlags && typeof existingUpdates.reviewFlags === "object") ? existingUpdates.reviewFlags : {}) as Record<string, unknown>), needsManualInput: reviewFlags },
    },
    review: {
      ...modificationDraft.review,
      checklist: {
        ...modificationDraft.review.checklist,
        needsManualInput: Array.from(new Set([...(modificationDraft.review.checklist.needsManualInput || []), ...reviewFlags])),
      },
    },
  };
}

async function requirePierManagerAuth() {
  const cookieStore = await cookies();
  const ok = await isValidAuthToken(cookieStore.get(AUTH_COOKIE)?.value);
  if (!ok) throw new Error("Unauthorized");
}

export async function POST(request: Request) {
  try {
    await requirePierManagerAuth();
    const body = (await request.json()) as AiDraftRequest;
    if (body.mode === "new-listing") {
      const draft = await withPropertyPortalTimeout(
        runListingResearchAndDraft({ input: body.input }),
        AI_DRAFT_ROUTE_TIMEOUT_MS,
        "AI broker review drafting timed out before a research dossier and draft were returned. Please retry with shorter instructions.",
      );
      return NextResponse.json({ ok: true, draft });
    }
    if (body.mode === "modification") {
      const draft = await withPropertyPortalTimeout(
        (async () => {
          const modificationDraft = await createModificationReviewDraft({ propertyIdOrSlug: body.propertyIdOrSlug, instructions: body.instructions });
          const current = (modificationDraft.currentListing || {}) as Record<string, unknown>;
          const researchDraft = await runListingResearchAndDraft({
            input: {
              ...current,
              listingTitle: String(current.title || body.propertyIdOrSlug),
              slug: String(current.slug || body.propertyIdOrSlug),
              addressStreet: String(current.streetAddress || current.address || current.fullAddress || ""),
              city: String(current.city || ""),
              state: String(current.state || ""),
              parcelId: String(current.parcelId || (current.property && typeof current.property === "object" ? (current.property as Record<string, unknown>).parcelId || "" : "")),
              latitude: current.lat ?? current.latitude,
              longitude: current.lng ?? current.longitude,
              propertyNotesDueDiligence: body.instructions,
              rawNotes: body.instructions,
            },
            mirrorToFirebase: false,
          });
          return mergeResearchDraftIntoModificationDraft(modificationDraft, researchDraft, body.instructions);
        })(),
        AI_DRAFT_ROUTE_TIMEOUT_MS,
        "AI broker review drafting timed out before a modification draft was returned. Please retry with shorter instructions.",
      );
      return NextResponse.json({ ok: true, draft });
    }
    if (body.mode === "revise") {
      const draft = await withPropertyPortalTimeout(
        reviseBrokerReviewDraft({ draft: body.draft, feedback: body.feedback }),
        AI_DRAFT_ROUTE_TIMEOUT_MS,
        "AI broker review drafting timed out before a revised draft was returned. Please retry with shorter feedback.",
      );
      return NextResponse.json({ ok: true, draft });
    }
    return NextResponse.json({ error: "Unsupported AI draft mode" }, { status: 400 });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const rawMessage = error instanceof Error ? error.message : "Failed to generate AI broker review draft";
    const normalized = /Cloud writer timed out/i.test(rawMessage)
      ? new Error(rawMessage)
      : createPropertyPortalProxyError(error, "AI broker review drafting");
    return NextResponse.json({ error: normalized.message }, { status: /timed out/i.test(normalized.message) ? 504 : 503 });
  }
}
