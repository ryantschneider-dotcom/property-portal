import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { AUTH_COOKIE, isValidAuthToken } from "@/lib/auth";
import {
  createMailchimpDraftCampaign,
  getMailchimpCampaign,
  getMailchimpCampaignContent,
  sendMailchimpCampaign,
  sendMailchimpTestEmail,
} from "@/lib/mailchimp-client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type CampaignRequest = {
  action?: "create-draft" | "fetch-preview" | "send-test" | "send-live";
  campaignId?: string;
  audienceId?: string;
  subjectLine?: string;
  fromName?: string;
  fromEmail?: string;
  brokerEmail?: string;
  title?: string;
  previewText?: string;
  listing?: Record<string, unknown>;
  includeFinancials?: boolean;
  smokeTestConfirmed?: boolean;
};

async function requirePierManagerAuth() {
  const cookieStore = await cookies();
  const ok = await isValidAuthToken(cookieStore.get(AUTH_COOKIE)?.value);
  if (!ok) throw new Error("Unauthorized");
}

function escapeHtml(value: unknown) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char] || char));
}

function getRecord(record: Record<string, unknown>, key: string) {
  const value = record[key];
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function getString(record: Record<string, unknown>, ...keys: string[]) {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number") return String(value);
  }
  return "";
}

function getAddressText(listing: Record<string, unknown>) {
  const address = listing.address;
  if (typeof address === "string") return address.trim();
  if (address && typeof address === "object" && !Array.isArray(address)) {
    const record = address as Record<string, unknown>;
    return getString(record, "full", "street") || [record.street, record.city, record.state].filter(Boolean).join(", ");
  }
  return "";
}

function getHeroImageUrl(listing: Record<string, unknown>) {
  const media = getRecord(listing, "media");
  const images = Array.isArray(media.images) ? media.images : [];
  const firstImage = images.find((image) => image && typeof image === "object") as Record<string, unknown> | undefined;
  const urls = firstImage && firstImage.urls && typeof firstImage.urls === "object" ? firstImage.urls as Record<string, unknown> : {};
  return getString(media, "heroImageUrl", "heroPhoto") || getString(urls, "xlarge", "large", "full", "original") || getString(listing, "heroImageUrl");
}

function getMarketingCopy(listing: Record<string, unknown>) {
  const content = getRecord(listing, "content");
  return getString(content, "marketingBlurb", "saleDescription", "leaseDescription", "description") || getString(listing, "description", "summary") || "PIER Commercial is sharing this ListingStream update for broker review and market distribution.";
}

function getFactRows(listing: Record<string, unknown>, includeFinancials?: boolean) {
  const property = getRecord(listing, "property");
  const pricing = getRecord(listing, "pricing");
  const rows: Array<[string, string]> = [];
  const size = getString(property, "buildingSizeSf", "availableSqFt") || getString(pricing, "availableSqFt");
  const acres = getString(property, "lotSizeAcres", "acreage");
  const salePrice = getString(pricing, "salePrice", "salePriceDollars");
  const leaseRate = getString(pricing, "leaseRate", "askingRent", "rate");
  if (size) rows.push(["Size", /sf/i.test(size) ? size : `±${size} SF`]);
  if (acres) rows.push(["Site", /ac/i.test(acres) ? acres : `${acres} AC`]);
  if (salePrice) rows.push(["Price", salePrice]);
  if (leaseRate) rows.push(["Rate", leaseRate]);
  if (includeFinancials) {
    const financials = getRecord(listing, "financials");
    const noi = getString(financials, "noi");
    const capRate = getString(financials, "capRate");
    if (noi) rows.push(["NOI", noi]);
    if (capRate) rows.push(["Cap Rate", capRate]);
  }
  return rows.slice(0, 6);
}

function getMailchimpPortalUrl(listing: Record<string, unknown>) {
  return getString(listing, "publicUrl", "previewUrl") || (getString(listing, "slug") ? `https://listingstream-portal.vercel.app/properties/${encodeURIComponent(getString(listing, "slug"))}` : "https://piercommercial.com");
}

export function buildListingEmailHtml(input: Required<Pick<CampaignRequest, "subjectLine" | "fromName" | "fromEmail">> & Pick<CampaignRequest, "listing" | "includeFinancials">) {
  const listing = input.listing || {};
  const title = escapeHtml(listing.title || getAddressText(listing) || "PIER Commercial Listing");
  const address = escapeHtml(getAddressText(listing));
  const transaction = escapeHtml(listing.transactionLabel || listing.listingType || listing.propertyType || "Commercial Real Estate Opportunity");
  const broker = escapeHtml(input.fromName);
  const email = escapeHtml(input.fromEmail);
  const portalUrl = escapeHtml(getMailchimpPortalUrl(listing));
  const heroImage = escapeHtml(getHeroImageUrl(listing));
  const marketingCopy = escapeHtml(getMarketingCopy(listing));
  const factRows = getFactRows(listing, input.includeFinancials);
  const factsHtml = factRows.length ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 24px;border-collapse:collapse;">${factRows.map(([label, value]) => `<tr><td style="width:36%;padding:10px 12px;border-bottom:1px solid #e8e0d8;font-family:Arial,Helvetica,sans-serif;font-size:12px;letter-spacing:.12em;text-transform:uppercase;color:#6b7280;font-weight:800;">${escapeHtml(label)}</td><td style="padding:10px 12px;border-bottom:1px solid #e8e0d8;font-family:Arial,Helvetica,sans-serif;font-size:16px;color:#1a1a2e;font-weight:700;">${escapeHtml(value)}</td></tr>`).join("")}</table>` : "";
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${escapeHtml(input.subjectLine)}</title>
  </head>
  <body style="margin:0;padding:0;background:#f4f1ed;font-family:Georgia,'Times New Roman',serif;color:#1a1a2e;">
    <center style="width:100%;background:#f4f1ed;padding:32px 0;">
      <table role="presentation" width="680" cellpadding="0" cellspacing="0" style="width:680px;max-width:680px;background:#ffffff;border-collapse:collapse;border:1px solid #e8e0d8;box-shadow:0 12px 36px rgba(15,25,35,.12);">
        <tr>
          <td style="background:#0f1923;padding:28px 34px 24px;border-bottom:5px solid #CB521E;">
            <div style="font-family:Arial,Helvetica,sans-serif;font-size:12px;letter-spacing:.18em;text-transform:uppercase;color:#CB521E;font-weight:800;">PIER Commercial Real Estate</div>
            <h1 style="margin:14px 0 8px;font-family:Georgia,'Times New Roman',serif;font-size:34px;line-height:1.08;color:#ffffff;font-weight:500;">${title}</h1>
            <div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;color:#f4f1ed;">${transaction}</div>
          </td>
        </tr>
        <tr>
          <td style="padding:0;background:#111827;">
            ${heroImage ? `<img src="${heroImage}" alt="${title}" width="680" style="display:block;width:680px;max-width:100%;height:auto;border:0;">` : `<div style="height:18px;background:#CB521E;"></div>`}
          </td>
        </tr>
        <tr>
          <td style="padding:34px;">
            <h2 style="margin:0 0 14px;font-family:Georgia,'Times New Roman',serif;font-size:25px;line-height:1.2;color:#1a1a2e;font-weight:500;">${escapeHtml(input.subjectLine)}</h2>
            ${address ? `<p style="margin:0 0 22px;font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:1.6;color:#374151;">${address}</p>` : ""}
            <p style="margin:0 0 24px;font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:1.65;color:#374151;">${marketingCopy}</p>
            ${factsHtml}
            ${input.includeFinancials ? `<div style="margin:0 0 24px;border-left:5px solid #CB521E;background:#fff7ed;padding:16px 18px;font-family:Arial,Helvetica,sans-serif;color:#7c2d12;font-size:15px;line-height:1.5;">High-level financial context is included where available in the ListingStream record.</div>` : ""}
            <a href="${portalUrl}" style="display:inline-block;background:#CB521E;color:#ffffff;text-decoration:none;font-family:Arial,Helvetica,sans-serif;font-size:15px;font-weight:800;letter-spacing:.02em;padding:14px 22px;border-radius:2px;">View ListingStream Property Page</a>
            <p style="margin:24px 0 0;font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.6;color:#6b7280;">Reply directly to ${broker} at <a href="mailto:${email}" style="color:#CB521E;font-weight:700;">${email}</a> for details, tour coordination, or underwriting support.</p>
          </td>
        </tr>
        <tr>
          <td style="padding:22px 34px;background:#f8f8f8;border-top:1px solid #e8e0d8;font-family:Arial,Helvetica,sans-serif;font-size:13px;line-height:1.6;color:#6b7280;">
            <strong style="color:#1a1a2e;">PIER Commercial Real Estate Brokerage and Management</strong><br>
            Savannah, Georgia · <a href="mailto:${email}" style="color:#CB521E;">${email}</a>
          </td>
        </tr>
      </table>
    </center>
  </body>
</html>`;
}

function validateBrokerEmail(fromEmail: string, brokerEmail?: string) {
  const target = String(brokerEmail || fromEmail || "").trim().toLowerCase();
  const sender = fromEmail.trim().toLowerCase();
  if (!target || !sender || target !== sender) throw new Error("Smoke tests can only be sent to the initiating broker's own email address.");
  return target;
}

export async function POST(request: Request) {
  try {
    await requirePierManagerAuth();
    const body = await request.json() as CampaignRequest;
    const action = body.action || "create-draft";
    const campaignId = String(body.campaignId || "").trim();

    if (action === "fetch-preview") {
      if (!campaignId) return NextResponse.json({ error: "Campaign id is required." }, { status: 400 });
      const [campaign, content] = await Promise.all([getMailchimpCampaign(campaignId), getMailchimpCampaignContent(campaignId)]);
      return NextResponse.json({ ok: true, campaign, previewHtml: content.html });
    }

    if (action === "send-test") {
      if (!campaignId) return NextResponse.json({ error: "Campaign id is required." }, { status: 400 });
      const brokerEmail = validateBrokerEmail(String(body.fromEmail || ""), body.brokerEmail);
      const smokeTest = await sendMailchimpTestEmail({ campaignId, brokerEmail });
      const content = await getMailchimpCampaignContent(campaignId);
      return NextResponse.json({ ok: true, smokeTest, previewHtml: content.html });
    }

    if (action === "send-live") {
      if (!campaignId) return NextResponse.json({ error: "Campaign id is required." }, { status: 400 });
      if (body.smokeTestConfirmed !== true) return NextResponse.json({ error: "Broker smoke test must be completed before list-wide deployment." }, { status: 409 });
      const send = await sendMailchimpCampaign(campaignId);
      const campaign = await getMailchimpCampaign(campaignId);
      return NextResponse.json({ ok: true, send, campaign });
    }

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
    const content = await getMailchimpCampaignContent(campaign.id);
    return NextResponse.json({ ok: true, campaign, previewHtml: content.html || html, smokeTestRequired: true });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not create Mailchimp draft campaign." }, { status: 503 });
  }
}
