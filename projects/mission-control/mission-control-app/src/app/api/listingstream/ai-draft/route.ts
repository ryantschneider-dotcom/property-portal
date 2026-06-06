import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { AUTH_COOKIE, isValidAuthToken } from "@/lib/auth";
import { createModificationReviewDraft, createNewListingReviewDraft, reviseBrokerReviewDraft, type BrokerReviewDraft } from "@/lib/property-portal-ai";
import { createPropertyPortalProxyError } from "@/lib/property-portal-client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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
      const draft = await createNewListingReviewDraft({ input: body.input });
      return NextResponse.json({ ok: true, draft });
    }
    if (body.mode === "modification") {
      const draft = await createModificationReviewDraft({ propertyIdOrSlug: body.propertyIdOrSlug, instructions: body.instructions });
      return NextResponse.json({ ok: true, draft });
    }
    if (body.mode === "revise") {
      const draft = await reviseBrokerReviewDraft({ draft: body.draft, feedback: body.feedback });
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
