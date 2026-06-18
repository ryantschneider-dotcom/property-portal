type ListingRecord = Record<string, any>;

export function getMailchimpServerPrefix(env: Record<string, string | undefined> = process.env) {
  const explicit = String(env.MAILCHIMP_SERVER_PREFIX || "").trim();
  if (explicit) return explicit;
  const apiKey = String(env.MAILCHIMP_API_KEY || "").trim();
  const suffix = apiKey.split("-").pop() || "";
  return /^us\d+$/i.test(suffix) ? suffix : "";
}

export function normalizeMailchimpLists(payload: any) {
  return (Array.isArray(payload?.lists) ? payload.lists : [])
    .map((item: any) => ({ id: String(item?.id || "").trim(), name: String(item?.name || "").trim(), memberCount: typeof item?.stats?.member_count === "number" ? item.stats.member_count : null }))
    .filter((item: { id: string; name: string }) => item.id && item.name);
}

function text(value: unknown) {
  return String(value ?? "").trim();
}

function money(value: unknown) {
  if (typeof value === "number") return `$${value.toLocaleString()}`;
  return text(value);
}

function size(value: unknown) {
  if (typeof value === "number") return `±${value.toLocaleString()} SF`;
  const raw = text(value);
  return raw && !/sf/i.test(raw) ? `±${raw} SF` : raw;
}

function acres(value: unknown) {
  if (typeof value === "number") return `${value.toLocaleString()} AC`;
  const raw = text(value);
  return raw && !/ac/i.test(raw) ? `${raw} AC` : raw;
}

function escapeHtml(value: unknown) {
  return text(value).replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char] || char));
}

function addressText(listing: ListingRecord) {
  const address = listing.address;
  if (typeof address === "string") return address;
  if (address && typeof address === "object") return text(address.full) || [address.street, address.city, address.state].filter(Boolean).join(", ");
  return "";
}

function titleLabel(listing: ListingRecord) {
  return text(listing.title) || addressText(listing) || "PIER Commercial Listing";
}

function propertyKind(listing: ListingRecord) {
  const raw = text(listing.propertyType || listing.visibility?.transactionLabel || listing.transactionLabel || listing.listingType);
  const tx = Array.isArray(listing.transactionTypes) ? listing.transactionTypes.join(" ").toLowerCase() : "";
  const propertyType = text(listing.property?.type || listing.propertyType).toLowerCase();
  if (/land/i.test(raw) || propertyType === "land") return "Land For Sale";
  if (/lease/i.test(raw) || /lease/i.test(tx)) return "Space For Lease";
  if (/sale/i.test(raw) || /sale/i.test(tx)) return /building/i.test(raw) ? "Building For Sale" : raw || "Building For Sale";
  return raw || "Commercial Real Estate Opportunity";
}

function subjectKind(kind: string) {
  if (/lease/i.test(kind)) return "SPACE FOR LEASE";
  if (/land/i.test(kind)) return "LAND FOR SALE";
  if (/sale/i.test(kind)) return "BUILDING FOR SALE";
  return kind.toUpperCase();
}

export function deriveMailchimpDefaultsFromListing(listing: ListingRecord) {
  const address = listing.address && typeof listing.address === "object" ? [listing.address.city, listing.address.state].filter(Boolean).join(", ") : "";
  const broker = listing.brokerProfile || listing.broker || {};
  return {
    subjectLine: [titleLabel(listing), text(listing.visibility?.transactionLabel || listing.transactionLabel || listing.listingType || listing.propertyType) || propertyKind(listing), address].filter(Boolean).join(" | "),
    fromName: text(broker.name) || "PIER Commercial Real Estate",
    replyTo: text(broker.email) || "ryan@piercommercial.com",
  };
}

export function buildMailchimpCampaignSettings(input: { listing: ListingRecord; listId: string; subjectLine: string; fromName: string; replyTo: string }) {
  return {
    type: "regular",
    recipients: { list_id: input.listId },
    settings: {
      subject_line: input.subjectLine,
      title: input.subjectLine,
      from_name: input.fromName,
      reply_to: input.replyTo,
      template_id: undefined,
    },
  };
}

function bullets(items: unknown) {
  if (!Array.isArray(items) || !items.length) return "";
  return `<h3>Highlights</h3><ul>${items.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>`;
}

export function buildMailchimpListingEmailHtml(input: { listing: ListingRecord; listingUrl: string; includeFinancials?: boolean }) {
  const listing = input.listing || {};
  const kind = propertyKind(listing);
  const title = titleLabel(listing);
  const hero = text(listing.media?.heroImageUrl || listing.media?.heroPhoto);
  const description = text(listing.content?.saleDescription || listing.content?.leaseDescription || listing.content?.marketingBlurb || listing.description);
  const highlights = listing.content?.saleBullets || listing.content?.leaseBullets || listing.content?.highlights;
  const brokerEmail = text(listing.brokerProfile?.email || listing.broker?.email || "ryan@piercommercial.com");
  const rows: string[] = [];
  if (/land/i.test(kind) && listing.property?.lotSizeAcres) rows.push(`<tr><th>Lot Size</th><td>${escapeHtml(acres(listing.property.lotSizeAcres))}</td></tr>`);
  if (!/land/i.test(kind) && listing.property?.buildingSizeSf) rows.push(`<tr><th>Building Size</th><td>${escapeHtml(size(listing.property.buildingSizeSf))}</td></tr>`);
  if (listing.pricing?.availableSqFt) rows.push(`<tr><th>Available Space</th><td>${escapeHtml(size(listing.pricing.availableSqFt))}</td></tr>`);
  if (listing.pricing?.salePrice) rows.push(`<tr><th>Price</th><td>${escapeHtml(money(listing.pricing.salePrice))}</td></tr>`);
  if (listing.pricing?.leaseRate) rows.push(`<tr><th>Lease Rate</th><td>${escapeHtml(listing.pricing.leaseRate)}</td></tr>`);
  let financials = "";
  if (input.includeFinancials) {
    financials = `<h3>High-Level Financials</h3><table><tr><th>NOI</th><td>${escapeHtml(money(listing.financials?.noi))}</td></tr><tr><th>Cap Rate</th><td>${escapeHtml(listing.financials?.capRate)}</td></tr></table>`;
  }
  const spaces = Array.isArray(listing.spaces) && listing.spaces.length ? `<h3>Available Spaces</h3>${listing.spaces.map((space: any) => `<p>Suite ${escapeHtml(space.suiteNumber)} — ${escapeHtml(size(space.sizeSf))}${space.notes ? ` — ${escapeHtml(space.notes)}` : ""}</p>`).join("")}` : "";
  return `<!doctype html><html><body style="margin:0;background:#f8f8f8;font-family:Arial,Helvetica,sans-serif;color:#1a1a2e;"><main style="max-width:760px;margin:0 auto;background:#fff;"><header style="background:#0f1923;color:white;padding:28px;"><strong>PIER Commercial Real Estate</strong><p>${subjectKind(kind)}</p><h1>${escapeHtml(title)}</h1></header>${hero ? `<img src="${escapeHtml(hero)}" alt="${escapeHtml(title)}" style="width:100%;height:auto;display:block;">` : ""}<section style="padding:28px;"><h2>${escapeHtml(kind)}</h2><p>${escapeHtml(description)}</p><h3>Property Description</h3><p>${escapeHtml(description)}</p>${rows.length ? `<table>${rows.join("")}</table>` : ""}${bullets(highlights)}${spaces}${financials}${listing.mapUrl ? `<p>Map Link: <a href="${escapeHtml(listing.mapUrl)}">${escapeHtml(listing.mapUrl)}</a></p>` : ""}<a href="${escapeHtml(input.listingUrl)}" style="background:#CB521E;color:#fff;padding:14px 20px;text-decoration:none;display:inline-block;">View Property Website</a><p>Contact <a href="mailto:${escapeHtml(brokerEmail)}">${escapeHtml(brokerEmail)}</a></p></section></main></body></html>`;
}
