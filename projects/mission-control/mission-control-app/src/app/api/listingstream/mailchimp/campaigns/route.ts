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
import { buildMailchimpListingEmailHtml } from "@/lib/mailchimp-listing-email";

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
  return getString(content, "marketingBlurb", "saleDescription", "leaseDescription", "description") || getString(listing, "description", "summary") || "PIER Commercial Real Estate Brokerage is sharing this commercial property update for broker review and market distribution.";
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
  return getString(listing, "publicUrl", "previewUrl") || (getString(listing, "slug") ? `https://listingportal.piercommercial.com/property/${encodeURIComponent(getString(listing, "slug"))}` : "https://piercommercial.com");
}
export function buildListingEmailHtml(input: Required<Pick<CampaignRequest, "subjectLine" | "fromName" | "fromEmail">> & Pick<CampaignRequest, "listing" | "includeFinancials">) {
  const listing = input.listing || {};
  return buildMailchimpListingEmailHtml({
    listing,
    listingUrl: getMailchimpPortalUrl(listing),
    includeFinancials: input.includeFinancials,
  });
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
