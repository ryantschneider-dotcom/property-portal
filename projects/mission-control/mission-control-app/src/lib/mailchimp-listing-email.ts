type EnvLike = Record<string, string | undefined>;

type RecordValue = Record<string, unknown>;

export type MailchimpAudienceOption = {
  id: string;
  name: string;
  memberCount: number | null;
};

export type MailchimpCampaignInput = {
  listing: RecordValue;
  listId: string;
  subjectLine: string;
  fromName: string;
  replyTo: string;
};

const PIER_ORANGE = "#CB521E";
const PIER_DARK_ORANGE = "#b55d2d";
const DEFAULT_LOGO_URL = "https://listingportal.piercommercial.com/brand/pier-logo.png";
const DEFAULT_HERO_URL = "https://listingportal.piercommercial.com/brand/pier-logo.png";
const DEFAULT_FROM_NAME = "PIER Commercial Real Estate";
const DEFAULT_REPLY_TO = "ryan@piercommercial.com";
const DEFAULT_BASE_URL = "https://listingstream-portal.vercel.app";

function isRecord(value: unknown): value is RecordValue {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function clean(value: unknown) {
  return typeof value === "string" || typeof value === "number" ? String(value).trim() : "";
}

function pick(source: unknown, paths: string[][]) {
  for (const path of paths) {
    let current: unknown = source;
    for (const key of path) {
      if (!isRecord(current)) {
        current = undefined;
        break;
      }
      current = current[key];
    }
    const text = clean(current);
    if (text) return text;
  }
  return "";
}

function pickArray(source: unknown, paths: string[][]) {
  for (const path of paths) {
    let current: unknown = source;
    for (const key of path) {
      if (!isRecord(current)) {
        current = undefined;
        break;
      }
      current = current[key];
    }
    if (Array.isArray(current)) return current.map(clean).filter(Boolean);
    if (typeof current === "string") return current.split(/\n|•|;/).map((item) => item.trim()).filter(Boolean);
  }
  return [];
}

function escapeHtml(value: unknown) {
  return clean(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function stripHtml(value: unknown) {
  return clean(value).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function absoluteHttpUrl(value: unknown) {
  const text = clean(value);
  return /^https?:\/\/[^\s]+$/i.test(text) ? text : "";
}

function formatNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return new Intl.NumberFormat("en-US").format(value);
  const text = clean(value);
  const parsed = Number(text.replace(/[^\d.]/g, ""));
  return Number.isFinite(parsed) && parsed > 0 ? new Intl.NumberFormat("en-US").format(parsed) : text;
}

function formatAvailableSf(value: unknown) {
  const formatted = formatNumber(value);
  return formatted ? `±${formatted} SF` : "Call for details";
}

function getTitle(listing: RecordValue) {
  return pick(listing, [["title"], ["property", "title"], ["address", "street"], ["slug"], ["id"]]) || "PIER Commercial Listing";
}

function getCityState(listing: RecordValue) {
  const city = pick(listing, [["address", "city"], ["city"], ["property", "city"]]);
  const state = pick(listing, [["address", "state"], ["state"], ["property", "state"]]);
  return [city, state].filter(Boolean).join(", ");
}

function getTransactionLabel(listing: RecordValue) {
  return pick(listing, [["visibility", "transactionLabel"], ["transactionLabel"], ["propertyType"], ["property", "type"]]) || "Commercial Real Estate Opportunity";
}

function getBrokerName(listing: RecordValue, env: EnvLike = process.env) {
  return pick(listing, [["brokerProfile", "name"], ["leadBroker"], ["ownerName"], ["broker", "name"]]) || env.MAILCHIMP_DEFAULT_FROM_NAME || DEFAULT_FROM_NAME;
}

function getBrokerEmail(listing: RecordValue, env: EnvLike = process.env) {
  return pick(listing, [["brokerProfile", "email"], ["ownerEmail"], ["broker", "email"], ["contact", "email"]]) || env.MAILCHIMP_DEFAULT_REPLY_TO || env.MAILCHIMP_DEFAULT_FROM_EMAIL || DEFAULT_REPLY_TO;
}

function getHeroUrl(listing: RecordValue) {
  const direct = pick(listing, [["media", "heroImageUrl"], ["media", "heroPhoto"], ["heroImageUrl"], ["imageUrl"], ["photoUrl"]]);
  if (absoluteHttpUrl(direct)) return direct;
  const photos = [listing["photos"], isRecord(listing.media) ? listing.media.photos : undefined, isRecord(listing.media) ? listing.media.images : undefined].find(Array.isArray) as unknown[] | undefined;
  if (photos) {
    for (const item of photos) {
      const candidate = isRecord(item) ? pick(item, [["url"], ["src"], ["downloadUrl"], ["urls", "full"], ["urls", "large"], ["urls", "original"]]) : clean(item);
      if (absoluteHttpUrl(candidate)) return candidate;
    }
  }
  return DEFAULT_HERO_URL;
}

function listingDetailUrl(listing: RecordValue, explicitUrl?: string) {
  if (absoluteHttpUrl(explicitUrl)) return explicitUrl || "";
  const publicUrl = pick(listing, [["propertyWebsiteUrl"], ["website"], ["url"]]);
  if (absoluteHttpUrl(publicUrl)) return publicUrl;
  const slug = pick(listing, [["slug"], ["id"]]);
  return slug ? `${DEFAULT_BASE_URL}/property/${encodeURIComponent(slug)}` : DEFAULT_BASE_URL;
}

function buildFacts(listing: RecordValue) {
  const available = pick(listing, [["pricing", "availableSqFt"], ["property", "availableSqFt"], ["availableSqFt"], ["buildingSizeSf"], ["property", "buildingSizeSf"]]);
  const leaseStructure = pick(listing, [["pricing", "leaseStructure"], ["leaseStructure"], ["spaces", "0", "leaseType"]]);
  const rate = pick(listing, [["pricing", "leaseRate"], ["pricing", "rate"], ["rate"], ["askingRate"]]);
  const lotSize = pick(listing, [["property", "lotSizeAcres"], ["lotSizeAcres"], ["lotSize"]]);
  const facts = [
    { label: "Total Available", value: available ? formatAvailableSf(available) : "Call for details" },
    { label: "Lease Structure", value: leaseStructure || rate || "Call for details" },
    { label: "Location", value: getCityState(listing) || pick(listing, [["address", "full"], ["address"]]) || "Savannah / Coastal Georgia" },
    { label: "Configuration", value: lotSize ? `Site size: ${escapeHtml(lotSize)}` : getTransactionLabel(listing) },
  ];
  return facts;
}

function firstParagraphs(listing: RecordValue) {
  const paragraphs = [
    stripHtml(pick(listing, [["content", "marketingBlurb"], ["marketingBlurb"], ["description"], ["content", "description"]])),
    stripHtml(pick(listing, [["content", "leaseDescription"], ["content", "saleDescription"], ["content", "locationDescription"], ["locationDescription"]])),
  ].filter(Boolean);
  if (paragraphs.length) return paragraphs.slice(0, 2);
  return [
    `${getTitle(listing)} is a PIER Commercial Real Estate listing positioned for users and investors in ${getCityState(listing) || "the Savannah market"}.`,
    "Review the listing details for current pricing, availability, property information, and broker contact information.",
  ];
}

function highlights(listing: RecordValue) {
  const items = [
    ...pickArray(listing, [["highlights"], ["content", "highlights"], ["content", "leaseBullets"], ["content", "saleBullets"]]),
  ];
  return items.length ? items.slice(0, 8) : ["PIER Commercial Real Estate brokerage opportunity", "Contact the broker for pricing, availability, and tour details"];
}

export function getMailchimpServerPrefix(env: EnvLike = process.env) {
  const explicit = clean(env.MAILCHIMP_SERVER_PREFIX);
  if (explicit) return explicit;
  const apiKey = clean(env.MAILCHIMP_API_KEY);
  const suffix = apiKey.split("-").pop() || "";
  return suffix !== apiKey ? suffix : "";
}

export function normalizeMailchimpLists(payload: unknown): MailchimpAudienceOption[] {
  const rawLists = isRecord(payload) && Array.isArray(payload.lists) ? payload.lists : [];
  return rawLists.flatMap((item) => {
    if (!isRecord(item)) return [];
    const id = clean(item.id);
    const name = clean(item.name);
    if (!id || !name) return [];
    const stats = isRecord(item.stats) ? item.stats : {};
    const memberCount = typeof stats.member_count === "number" ? stats.member_count : null;
    return [{ id, name, memberCount }];
  });
}

export function deriveMailchimpDefaultsFromListing(listing: RecordValue, env: EnvLike = process.env) {
  const title = getTitle(listing);
  const transaction = getTransactionLabel(listing);
  const cityState = getCityState(listing);
  return {
    subjectLine: [title, transaction, cityState].filter(Boolean).join(" | "),
    fromName: getBrokerName(listing, env),
    replyTo: getBrokerEmail(listing, env),
  };
}

export function buildMailchimpCampaignSettings(input: MailchimpCampaignInput) {
  const listId = clean(input.listId);
  const subjectLine = clean(input.subjectLine);
  const fromName = clean(input.fromName);
  const replyTo = clean(input.replyTo);
  if (!listId) throw new Error("Mailchimp list/audience is required.");
  if (!subjectLine) throw new Error("Subject line is required.");
  if (!fromName) throw new Error("From name is required.");
  if (!/^\S+@\S+\.\S+$/.test(replyTo)) throw new Error("A valid from/reply-to email is required.");
  const listingTitle = getTitle(input.listing);
  return {
    type: "regular" as const,
    recipients: { list_id: listId },
    settings: {
      subject_line: subjectLine,
      title: `${listingTitle} Listing Email Draft`,
      from_name: fromName,
      reply_to: replyTo,
      auto_footer: true,
      inline_css: true,
    },
  };
}

export function buildMailchimpListingEmailHtml({ listing, listingUrl, logoUrl }: { listing: RecordValue; listingUrl?: string; logoUrl?: string }) {
  const title = getTitle(listing);
  const cityState = getCityState(listing);
  const transaction = getTransactionLabel(listing);
  const heroUrl = getHeroUrl(listing);
  const brokerName = getBrokerName(listing);
  const brokerEmail = getBrokerEmail(listing);
  const detailUrl = listingDetailUrl(listing, listingUrl);
  const safeLogo = absoluteHttpUrl(logoUrl) || DEFAULT_LOGO_URL;
  const paragraphs = firstParagraphs(listing);
  const factCards = buildFacts(listing);
  const bulletItems = highlights(listing);

  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(title)} | ${escapeHtml(transaction)}</title>
</head>
<body style="margin:0;padding:0;background:#f5f3ef;font-family:Arial,Helvetica,sans-serif;color:#2b2b2b;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#f5f3ef;">
    <tr>
      <td align="center" style="padding:24px 12px;">
        <table role="presentation" width="680" cellspacing="0" cellpadding="0" border="0" style="width:680px;max-width:680px;background:#ffffff;border-collapse:collapse;">
          <tr>
            <td style="padding:28px 36px 14px 36px;background:#ffffff;border-bottom:4px solid ${PIER_ORANGE};">
              <img src="${escapeHtml(safeLogo)}" alt="PIER Commercial Real Estate" width="220" style="display:block;width:220px;max-width:100%;height:auto;border:0;margin:0 0 18px 0;">
              <h1 style="margin:10px 0 6px 0;font-size:30px;line-height:1.2;color:#1f1f1f;">${escapeHtml(title)}</h1>
              <div style="font-size:18px;line-height:1.5;color:${PIER_ORANGE};font-weight:bold;">${escapeHtml([cityState, transaction].filter(Boolean).join(" | "))}</div>
            </td>
          </tr>
          <tr><td><img src="${escapeHtml(heroUrl)}" alt="${escapeHtml(title)}" width="680" style="display:block;width:100%;max-width:680px;height:auto;border:0;"></td></tr>
          <tr><td style="padding:28px 36px 8px 36px;">${paragraphs.map((paragraph, index) => `<p style="margin:0 0 16px 0;font-size:${index === 0 ? "17" : "16"}px;line-height:1.7;">${escapeHtml(paragraph)}</p>`).join("")}</td></tr>
          <tr>
            <td style="padding:4px 36px 8px 36px;">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="border-collapse:collapse;">
                ${[0, 2].map((start) => `<tr>${factCards.slice(start, start + 2).map((fact, index) => `<td width="50%" style="padding:0 ${index === 0 ? "8px" : "0"} 12px ${index === 0 ? "0" : "8px"};vertical-align:top;"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="border:1px solid #ddd7cf;background:#fbfaf8;"><tr><td style="padding:14px 16px;font-size:15px;line-height:1.7;"><strong>${escapeHtml(fact.label)}</strong><br>${escapeHtml(fact.value)}</td></tr></table></td>`).join("")}</tr>`).join("")}
              </table>
            </td>
          </tr>
          <tr><td style="padding:8px 36px 4px 36px;"><h2 style="margin:0 0 12px 0;font-size:20px;color:#1f1f1f;">Property Highlights</h2><ul style="margin:0;padding-left:20px;font-size:16px;line-height:1.8;color:#2b2b2b;">${bulletItems.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul></td></tr>
          <tr><td style="padding:24px 36px 10px 36px;"><table role="presentation" cellspacing="0" cellpadding="0" border="0"><tr><td style="background:${PIER_ORANGE};border-radius:2px;"><a href="${escapeHtml(detailUrl)}" style="display:inline-block;padding:14px 24px;font-size:15px;font-weight:bold;color:#ffffff;text-decoration:none;">View Listing Details</a></td></tr></table></td></tr>
          <tr><td style="padding:8px 36px 32px 36px;"><p style="margin:0 0 14px 0;font-size:16px;line-height:1.7;">For pricing, property details, or to schedule a tour, contact ${escapeHtml(brokerName)} directly.</p><p style="margin:0;font-size:15px;line-height:1.8;color:#5f5f5f;"><strong style="color:#2b2b2b;">${escapeHtml(brokerName)}</strong><br>PIER Commercial Real Estate<br><a href="mailto:${escapeHtml(brokerEmail)}" style="color:${PIER_DARK_ORANGE};text-decoration:none;">${escapeHtml(brokerEmail)}</a></p></td></tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

export function getMailchimpConfig(env: EnvLike = process.env) {
  const apiKey = clean(env.MAILCHIMP_API_KEY);
  const serverPrefix = getMailchimpServerPrefix(env);
  return {
    apiKey,
    serverPrefix,
    configured: Boolean(apiKey && serverPrefix),
    apiBaseUrl: serverPrefix ? `https://${serverPrefix}.api.mailchimp.com/3.0` : "",
  };
}
