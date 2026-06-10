import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { AUTH_COOKIE, isValidAuthToken } from "@/lib/auth";
import { buildPropertyPortalUrl, getPropertyPortalInternalHeaders, safePropertyPortalFetch } from "@/lib/property-portal-client";
import { buildMailchimpCampaignSettings, buildMailchimpListingEmailHtml, deriveMailchimpDefaultsFromListing, getMailchimpConfig } from "@/lib/mailchimp-listing-email";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function requirePierManagerAuth() {
  const cookieStore = await cookies();
  const ok = await isValidAuthToken(cookieStore.get(AUTH_COOKIE)?.value);
  if (!ok) throw new Error("Unauthorized");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function clean(value: unknown) {
  return typeof value === "string" || typeof value === "number" ? String(value).trim() : "";
}

function mailchimpHeaders(apiKey: string) {
  return {
    accept: "application/json",
    "content-type": "application/json",
    authorization: `Basic ${Buffer.from(`mission-control:${apiKey}`).toString("base64")}`,
  };
}

async function fetchListing(propertyIdOrSlug: string) {
  const response = await safePropertyPortalFetch(fetch, buildPropertyPortalUrl(`/api/properties/${encodeURIComponent(propertyIdOrSlug)}`), {
    cache: "no-store",
    headers: {
      accept: "application/json",
      ...getPropertyPortalInternalHeaders(),
    },
  }, "mailchimp listing lookup");
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !isRecord(data)) throw new Error("Selected ListingStream listing could not be loaded for Mailchimp draft generation.");
  return data;
}

export async function POST(request: Request) {
  try {
    await requirePierManagerAuth();
    const body = await request.json().catch(() => ({}));
    if (!isRecord(body)) return NextResponse.json({ error: "Invalid request body." }, { status: 400 });

    const propertyIdOrSlug = clean(body.propertyIdOrSlug);
    const listId = clean(body.listId);
    if (!propertyIdOrSlug) return NextResponse.json({ error: "Select a ListingStream listing before generating a Mailchimp draft." }, { status: 400 });
    if (!listId) return NextResponse.json({ error: "Select a Mailchimp audience/list before generating a draft campaign." }, { status: 400 });

    const listing = await fetchListing(propertyIdOrSlug);
    const defaults = deriveMailchimpDefaultsFromListing(listing);
    const subjectLine = clean(body.subjectLine) || defaults.subjectLine;
    const fromName = clean(body.fromName) || defaults.fromName;
    const replyTo = clean(body.replyTo) || defaults.replyTo;
    const listingUrl = clean(body.listingUrl) || buildPropertyPortalUrl(`/property/${encodeURIComponent(clean(listing.slug) || propertyIdOrSlug)}`);
    const html = buildMailchimpListingEmailHtml({ listing, listingUrl });
    const campaignPayload = buildMailchimpCampaignSettings({ listing, listId, subjectLine, fromName, replyTo });
    const config = getMailchimpConfig();

    if (!config.configured) {
      return NextResponse.json({ error: "Mailchimp is not configured yet. Add MAILCHIMP_API_KEY with a data-center suffix before creating draft campaigns.", html, campaignPayload, draftOnly: true }, { status: 503 });
    }

    const campaignResponse = await fetch(`${config.apiBaseUrl}/campaigns`, {
      method: "POST",
      headers: mailchimpHeaders(config.apiKey),
      body: JSON.stringify(campaignPayload),
    });
    const campaign = await campaignResponse.json().catch(() => ({}));
    if (!campaignResponse.ok || !isRecord(campaign) || !clean(campaign.id)) {
      return NextResponse.json({ error: "Mailchimp campaign draft creation failed. No email was sent." }, { status: campaignResponse.status || 502 });
    }

    const campaignId = clean(campaign.id);
    const contentResponse = await fetch(`${config.apiBaseUrl}/campaigns/${encodeURIComponent(campaignId)}/content`, {
      method: "PUT",
      headers: mailchimpHeaders(config.apiKey),
      body: JSON.stringify({ html }),
    });
    const content = await contentResponse.json().catch(() => ({}));
    if (!contentResponse.ok) {
      return NextResponse.json({ error: "Mailchimp campaign was created, but setting the email HTML content failed. Check Mailchimp before re-running." }, { status: contentResponse.status || 502 });
    }

    return NextResponse.json({
      success: true,
      draftOnly: true,
      campaignId,
      webId: campaign.web_id ?? null,
      status: campaign.status ?? "save",
      archiveUrl: campaign.archive_url ?? null,
      subjectLine,
      fromName,
      replyTo,
      listId,
      html,
      contentSet: Boolean(content),
    });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not create Mailchimp draft campaign." }, { status: 503 });
  }
}
