import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { AUTH_COOKIE, isValidAuthToken } from "@/lib/auth";
import { createMailchimpDraftCampaign } from "@/lib/mailchimp-client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type CampaignRequest = {
  audienceId?: string;
  subjectLine?: string;
  fromName?: string;
  fromEmail?: string;
  title?: string;
  previewText?: string;
  listing?: Record<string, unknown>;
  includeFinancials?: boolean;
};

async function requirePierManagerAuth() {
  const cookieStore = await cookies();
  const ok = await isValidAuthToken(cookieStore.get(AUTH_COOKIE)?.value);
  if (!ok) throw new Error("Unauthorized");
}

function escapeHtml(value: unknown) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char] || char));
}

function buildListingEmailHtml(input: Required<Pick<CampaignRequest, "subjectLine" | "fromName" | "fromEmail">> & Pick<CampaignRequest, "listing" | "includeFinancials">) {
  const listing = input.listing || {};
  const title = escapeHtml(listing.title || listing.address || "PIER Commercial Listing");
  const address = escapeHtml(listing.address || "");
  const transaction = escapeHtml(listing.transactionLabel || listing.listingType || "Listing Update");
  const broker = escapeHtml(input.fromName);
  const email = escapeHtml(input.fromEmail);
  return `<!doctype html><html><body style="margin:0;background:#f5f5f4;font-family:Arial,sans-serif;color:#1a1a2e;"><div style="max-width:680px;margin:0 auto;background:#ffffff;"><div style="background:#0f1923;color:#ffffff;padding:28px;"><p style="margin:0;color:#CB521E;font-weight:700;letter-spacing:.16em;text-transform:uppercase;font-size:12px;">PIER Commercial Real Estate</p><h1 style="margin:12px 0 0;font-size:30px;line-height:1.1;">${title}</h1><p style="margin:12px 0 0;color:#e5e7eb;">${transaction}</p></div><div style="padding:28px;"><h2 style="margin:0 0 10px;font-size:22px;">${escapeHtml(input.subjectLine)}</h2>${address ? `<p style="font-size:16px;line-height:1.6;margin:0 0 18px;color:#374151;">${address}</p>` : ""}<p style="font-size:16px;line-height:1.6;color:#374151;">For details, reply directly to ${broker} at <a href="mailto:${email}" style="color:#CB521E;">${email}</a>.</p>${input.includeFinancials ? `<p style="border:1px solid #fed7aa;background:#fff7ed;border-radius:14px;padding:14px;color:#7c2d12;">High-level financial summary included where available in ListingStream.</p>` : ""}<a href="mailto:${email}" style="display:inline-block;margin-top:10px;background:#CB521E;color:#ffffff;text-decoration:none;padding:12px 18px;border-radius:12px;font-weight:700;">Contact ${broker}</a></div></div></body></html>`;
}

export async function POST(request: Request) {
  try {
    await requirePierManagerAuth();
    const body = await request.json() as CampaignRequest;
    const audienceId = String(body.audienceId || "").trim();
    const subjectLine = String(body.subjectLine || "").trim();
    const fromName = String(body.fromName || "").trim();
    const fromEmail = String(body.fromEmail || "").trim();
    if (!audienceId || !subjectLine || !fromName || !fromEmail) {
      return NextResponse.json({ error: "Audience, subject, broker name, and broker email are required." }, { status: 400 });
    }
    const title = String(body.title || `${subjectLine} — PIER Manager Draft`).trim();
    const html = buildListingEmailHtml({ subjectLine, fromName, fromEmail, listing: body.listing, includeFinancials: body.includeFinancials });
    const campaign = await createMailchimpDraftCampaign({ audienceId, subjectLine, fromName, fromEmail, title, previewText: body.previewText, html });
    return NextResponse.json({ ok: true, campaign });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not create Mailchimp draft campaign." }, { status: 503 });
  }
}
