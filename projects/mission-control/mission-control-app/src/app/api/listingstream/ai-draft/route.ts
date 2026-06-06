import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { AUTH_COOKIE, isValidAuthToken } from "@/lib/auth";
import { createModificationReviewDraft, createNewListingReviewDraft, reviseBrokerReviewDraft, type BrokerReviewDraft } from "@/lib/property-portal-ai";
import { createPropertyPortalProxyError, withPropertyPortalTimeout } from "@/lib/property-portal-client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const AI_DRAFT_ROUTE_TIMEOUT_MS = Number(process.env.PIER_MANAGER_AI_DRAFT_ROUTE_TIMEOUT_MS ?? 55_000);

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
        createNewListingReviewDraft({ input: body.input }),
        AI_DRAFT_ROUTE_TIMEOUT_MS,
        "AI broker review drafting timed out before a draft was returned. Please retry with shorter instructions.",
      );
      return NextResponse.json({ ok: true, draft });
    }
    if (body.mode === "modification") {
      const draft = await withPropertyPortalTimeout(
        createModificationReviewDraft({ propertyIdOrSlug: body.propertyIdOrSlug, instructions: body.instructions }),
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
