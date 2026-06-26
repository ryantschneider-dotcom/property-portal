type ListingRecord = Record<string, any>;

const PIER_ORANGE = "#CB521E";
const PIER_TEXT = "#1a1a2e";
const PIER_LOGO_URL = process.env.PIER_EMAIL_LOGO_URL || "https://missioncontrol.piercommercial.com/assets/Brokeragetransp.png";
const PIER_PUBLIC_LISTING_BASE_URL = process.env.PIER_PUBLIC_LISTING_BASE_URL || "https://listingportal.piercommercial.com";

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

function record(value: unknown): ListingRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? value as ListingRecord : {};
}

function getNested(source: ListingRecord, path: string) {
  return path.split(".").reduce<unknown>((current, key) => {
    if (Array.isArray(current) && /^\d+$/.test(key)) return current[Number(key)];
    return record(current)[key];
  }, source);
}

function firstText(source: ListingRecord, paths: string[]) {
  for (const path of paths) {
    const value = getNested(source, path);
    if (typeof value === "number" && Number.isFinite(value)) return String(value);
    const clean = text(value);
    if (clean) return clean;
  }
  return "";
}

function firstDeepText(source: unknown, keyPatterns: RegExp[], valuePattern?: RegExp): string {
  const seen = new Set<unknown>();
  const queue: unknown[] = [source];
  while (queue.length) {
    const current = queue.shift();
    if (!current || seen.has(current)) continue;
    if (typeof current === "object") seen.add(current);
    if (Array.isArray(current)) {
      queue.push(...current);
      continue;
    }
    if (typeof current !== "object") continue;
    for (const [key, value] of Object.entries(current as ListingRecord)) {
      const clean = text(value);
      if (keyPatterns.some((pattern) => pattern.test(key)) && clean && (!valuePattern || valuePattern.test(clean))) return clean;
      if (value && typeof value === "object") queue.push(value);
    }
  }
  return "";
}

function collectArrays(source: unknown, keyPatterns: RegExp[]): unknown[][] {
  const seen = new Set<unknown>();
  const arrays: unknown[][] = [];
  const queue: unknown[] = [source];
  while (queue.length) {
    const current = queue.shift();
    if (!current || seen.has(current)) continue;
    if (typeof current === "object") seen.add(current);
    if (Array.isArray(current)) {
      queue.push(...current);
      continue;
    }
    if (typeof current !== "object") continue;
    for (const [key, value] of Object.entries(current as ListingRecord)) {
      if (Array.isArray(value) && keyPatterns.some((pattern) => pattern.test(key))) arrays.push(value);
      if (value && typeof value === "object") queue.push(value);
    }
  }
  return arrays;
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
  if (address && typeof address === "object") return text(address.full) || [address.street, address.city, address.state, address.zip].filter(Boolean).join(", ");
  return firstText(listing, ["location.address", "property.address"]);
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

function heroImageUrl(listing: ListingRecord) {
  const media = record(listing.media);
  const mediaImages = Array.isArray(media.images) ? media.images : [];
  const firstMediaImage = record(mediaImages.find((image) => record(image).url || record(record(image).urls).original || record(record(image).urls).full));
  const firstMediaImageUrl = text(firstMediaImage.url) || firstText(firstMediaImage, ["urls.original", "urls.full", "urls.xlarge", "urls.large"]);
  if (firstMediaImageUrl) return firstMediaImageUrl;
  const direct = firstText(listing, [
    "media.images.0.url",
    "media.images.0.urls.original",
    "media.images.0.urls.full",
    "media.heroImageUrl",
    "media.heroPhoto",
    "media.hero.url",
    "media.primary.url",
    "media.primaryPhoto.url",
    "heroImageUrl",
    "heroPhoto",
    "primaryPhotoUrl",
    "featuredImageUrl",
    "image.url",
  ]);
  if (direct) return direct;
  const nested = firstDeepText(listing, [/^(heroImageUrl|heroPhoto|primaryPhotoUrl|featuredImageUrl|url|src|href|xlarge|large|full|original)$/i], /^https?:\/\//i);
  return nested;
}

function marketingDescription(listing: ListingRecord) {
  const verifiedSections = [
    firstText(listing, ["content.propertyDescription", "content.leaseDescription", "content.saleDescription"]),
    firstText(listing, ["content.locationDescription"]),
    firstText(listing, ["content.siteDescription"]),
  ].filter(Boolean);
  const uniqueSections = verifiedSections.filter((section, index, all) => all.findIndex((candidate) => candidate.toLowerCase() === section.toLowerCase()) === index);
  if (uniqueSections.length) return uniqueSections.join("\n\n");
  return firstText(listing, [
    "content.propertyOverview",
    "content.marketingDescription",
    "content.marketingBlurb",
    "content.description",
    "property.description",
    "property.propertyDescription",
    "admin.description",
    "description",
    "propertyDescription",
    "summary",
  ]) || firstDeepText(listing, [/^(propertyDescription|siteDescription|locationDescription|propertyOverview|marketingDescription|marketingBlurb|saleDescription|leaseDescription|description|summary)$/i]);
}

function highlightItems(listing: ListingRecord) {
  const content = record(listing.content);
  const source = content.saleBullets || content.leaseBullets || content.highlights || listing.highlights;
  const items = Array.isArray(source) ? source.map(text).filter(Boolean) : [];
  const facts = factHighlights(listing);
  return [...facts, ...items].filter((item, index, arr) => arr.findIndex((candidate) => candidate.toLowerCase() === item.toLowerCase()) === index).slice(0, 8);
}

function factHighlights(listing: ListingRecord) {
  const rows: string[] = [];
  const property = record(listing.property);
  const pricing = record(listing.pricing);
  const leaseRate = text(pricing.leaseRate || pricing.askingRent || pricing.rate);
  const availableSf = pricing.availableSqFt || property.availableSqFt || property.buildingSizeSf || listing.buildingSizeSf;
  const totalSf = property.totalSf || property.totalSF || property.buildingSizeSf || listing.buildingSizeSf;
  const acreage = property.lotSizeAcres || property.acreage || listing.acreage;
  const zoning = text(property.zoning?.code || property.zoning || listing.zoning?.code || listing.zoning);
  const salePrice = pricing.salePrice || pricing.salePriceDollars;
  if (leaseRate) rows.push(`Lease Rate: ${leaseRate}`);
  if (salePrice) rows.push(`Pricing: ${money(salePrice)}`);
  if (availableSf) rows.push(`Available SF: ${size(availableSf)}`);
  if (totalSf && totalSf !== availableSf) rows.push(`Total SF: ${size(totalSf)}`);
  if (acreage) rows.push(`Acreage: ${acres(acreage)}`);
  if (zoning) rows.push(`Zoning: ${zoning}`);
  return rows;
}

function factRows(listing: ListingRecord, includeFinancials?: boolean) {
  const property = record(listing.property);
  const pricing = record(listing.pricing);
  const rows: Array<[string, string]> = [];
  const leaseRate = text(pricing.leaseRate || pricing.askingRent || pricing.rate);
  const salePrice = pricing.salePrice || pricing.salePriceDollars;
  const totalSf = property.totalSf || property.totalSF || property.buildingSizeSf || listing.buildingSizeSf;
  const availableSf = pricing.availableSqFt || property.availableSqFt;
  const acreage = property.lotSizeAcres || property.acreage || listing.acreage;
  const zoning = text(property.zoning?.code || property.zoning || listing.zoning?.code || listing.zoning);
  if (leaseRate) rows.push(["Lease Rate", leaseRate]);
  if (salePrice) rows.push(["Price", money(salePrice)]);
  if (availableSf) rows.push(["Available SF", size(availableSf)]);
  if (totalSf) rows.push(["Total SF", size(totalSf)]);
  if (acreage) rows.push(["Acreage", acres(acreage)]);
  if (zoning) rows.push(["Zoning", zoning]);
  if (includeFinancials) {
    const financials = record(listing.financials);
    const noi = financials.noi;
    const capRate = text(financials.capRate);
    if (noi) rows.push(["NOI", money(noi)]);
    if (capRate) rows.push(["Cap Rate", capRate]);
  }
  return rows.slice(0, 8);
}

function brokerInfo(listing: ListingRecord) {
  const broker = record(listing.brokerProfile || listing.broker || {});
  return {
    name: text(broker.name) || "Ryan T. Schneider, CCIM",
    title: text(broker.title) || "President",
    email: text(broker.email) || "ryan@piercommercial.com",
    phone: text(broker.phone) || "912-239-6298",
  };
}

function brandedListingUrl(listing: ListingRecord, listingUrl: string) {
  const slug = text(listing.slug || listing.id);
  const candidate = text(listing.publicUrl || listing.pierPublicUrl || listingUrl);
  if (candidate && !/listingstream/i.test(candidate)) return candidate;
  return slug ? `${PIER_PUBLIC_LISTING_BASE_URL.replace(/\/$/, "")}/property/${encodeURIComponent(slug)}` : "https://www.piercommercial.com/";
}

function tableRows(rows: Array<[string, string]>) {
  if (!rows.length) return "";
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;border-top:1px solid #e5e7eb;margin:0 0 28px 0;">${rows.map(([label, value]) => `<tr><td width="38%" style="padding:13px 0;border-bottom:1px solid #e5e7eb;font-family:Arial,Helvetica,sans-serif;font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:#6b7280;font-weight:700;">${escapeHtml(label)}</td><td style="padding:13px 0 13px 18px;border-bottom:1px solid #e5e7eb;font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:1.35;color:${PIER_TEXT};font-weight:700;">${escapeHtml(value)}</td></tr>`).join("")}</table>`;
}

function suiteLabel(suite: ListingRecord, index: number) {
  const label = text(suite.suiteNumber || suite.suite || suite.unit || suite.name || suite.label || suite.spaceName);
  if (!label) return `Space ${index + 1}`;
  return /^suite\b/i.test(label) ? label : `Suite ${label}`;
}

function suiteSize(suite: ListingRecord) {
  return size(suite.sizeSf || suite.squareFeet || suite.sqFt || suite.sf || suite.availableSqFt || suite.areaSqFt || suite.size);
}

function suiteRate(suite: ListingRecord) {
  const pricing = record(suite.pricing);
  const value = suite.leaseRate || suite.baseRent || suite.ratePerSf || suite.askingRatePerSf || suite.askingRent || suite.price || pricing.leaseRate || pricing.askingRent || pricing.rate || pricing.price;
  const rentType = text(suite.rentType || pricing.rentType);
  const suffix = rentType ? ` ${rentType}` : "";
  if (typeof value === "number" && Number.isFinite(value)) return `$${value.toLocaleString()}${suffix}`;
  const raw = text(value);
  if (!raw || /call|inquire/i.test(raw)) return raw;
  const prefixed = /^\$/.test(raw) ? raw : `$${raw}`;
  return `${prefixed}${suffix}`.trim();
}

function suiteRows(listing: ListingRecord) {
  const verifiedAdminSuites = Array.isArray(listing.admin?.suites) ? listing.admin.suites as unknown[] : [];
  const explicitArrays = verifiedAdminSuites.length
    ? [verifiedAdminSuites]
    : [listing.availableSuites, listing.availableSpaces, listing.leaseSpaces, listing.spaces].filter(Array.isArray) as unknown[][];
  const discoveredArrays = verifiedAdminSuites.length ? [] : collectArrays(listing, [/^(suites|spaces|availableSpaces|availableSuites|leaseSpaces)$/i]);
  const arrays = [...explicitArrays, ...discoveredArrays];
  const rows: Array<[string, string]> = [];
  const seenLabels = new Set<string>();
  const seen = new Set<string>();
  for (const suiteArray of arrays) {
    for (const suiteValue of suiteArray) {
      const suite = record(suiteValue);
      if (!Object.keys(suite).length) continue;
      const label = suiteLabel(suite, rows.length);
      const labelKey = label.toLowerCase();
      if (seenLabels.has(labelKey)) continue;
      const details = [suiteSize(suite), suiteRate(suite), text(suite.spaceType), text(suite.suiteNotes || suite.notes || suite.description)].filter(Boolean).join(" · ");
      if (!details) continue;
      const key = `${label}|${details}`.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      seenLabels.add(labelKey);
      rows.push([label, details]);
    }
  }
  return rows.slice(0, 12);
}

function suiteSummaryHtml(rows: Array<[string, string]>) {
  if (!rows.length) return "";
  return `<h2 style="margin:0 0 14px 0;font-family:Arial,Helvetica,sans-serif;font-size:13px;line-height:1.3;letter-spacing:.16em;text-transform:uppercase;color:${PIER_TEXT};font-weight:800;">Available Suites</h2><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;border-top:1px solid #e5e7eb;margin:0 0 30px 0;">${rows.map(([label, detail]) => `<tr><td width="32%" style="padding:14px 0;border-bottom:1px solid #e5e7eb;font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.35;color:${PIER_TEXT};font-weight:800;">${escapeHtml(label)}</td><td style="padding:14px 0 14px 18px;border-bottom:1px solid #e5e7eb;font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.5;color:#374151;">${escapeHtml(detail)}</td></tr>`).join("")}</table>`;
}

function bulletsHtml(items: string[]) {
  if (!items.length) return "";
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin:0 0 30px 0;">${items.map((item) => `<tr><td width="18" valign="top" style="padding:0 0 10px 0;font-family:Arial,Helvetica,sans-serif;font-size:18px;line-height:1;color:${PIER_ORANGE};">•</td><td valign="top" style="padding:0 0 10px 0;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.55;color:#374151;">${escapeHtml(item)}</td></tr>`).join("")}</table>`;
}

export function buildMailchimpListingEmailHtml(input: { listing: ListingRecord; listingUrl: string; includeFinancials?: boolean; logoUrl?: string }) {
  const listing = input.listing || {};
  const title = titleLabel(listing);
  const address = addressText(listing);
  const kind = propertyKind(listing);
  const transactionLabel = subjectKind(kind);
  const hero = heroImageUrl(listing);
  const description = marketingDescription(listing);
  const facts = factRows(listing, input.includeFinancials);
  const highlights = highlightItems(listing);
  const suites = suiteRows(listing);
  const broker = brokerInfo(listing);
  const ctaUrl = brandedListingUrl(listing, input.listingUrl);
  const logoUrl = text(input.logoUrl) || PIER_LOGO_URL;

  return `<!doctype html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta http-equiv="X-UA-Compatible" content="IE=edge">
    <title>${escapeHtml(title)} | PIER Commercial Real Estate</title>
  </head>
  <body style="margin:0;padding:0;background:#ffffff;-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%;">
    <center role="article" aria-roledescription="email" lang="en" style="width:100%;background:#ffffff;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;background:#ffffff;">
        <tr>
          <td align="center" style="padding:28px 18px;">
            <table role="presentation" width="760" cellpadding="0" cellspacing="0" style="width:760px;max-width:760px;border-collapse:collapse;background:#ffffff;border:1px solid #ece7e1;">
              <tr>
                <td style="background:#ffffff;padding:26px 34px;border-bottom:1px solid #ece7e1;">
                  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
                    <tr>
                      <td align="left" valign="middle">
                        <img src="${escapeHtml(logoUrl)}" width="220" alt="PIER Commercial Real Estate" style="display:block;width:220px;max-width:220px;height:auto;border:0;outline:none;text-decoration:none;">
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>
              ${hero ? `<tr>
                <td style="background:#ffffff;padding:0;">
                  <img src="${escapeHtml(hero)}" width="760" alt="${escapeHtml(title)}" style="display:block;width:760px;max-width:100%;height:auto;border:0;outline:none;text-decoration:none;">
                </td>
              </tr>` : ""}
              <tr>
                <td style="padding:38px 44px 22px 44px;background:#ffffff;">
                  <div style="font-family:Arial,Helvetica,sans-serif;font-size:12px;letter-spacing:.18em;text-transform:uppercase;color:${PIER_ORANGE};font-weight:800;margin:0 0 12px 0;">${escapeHtml(transactionLabel)}</div>
                  <h1 style="margin:0 0 10px 0;font-family:Georgia,'Times New Roman',serif;font-size:36px;line-height:1.08;color:${PIER_TEXT};font-weight:500;">${escapeHtml(title)}</h1>
                  ${address ? `<div style="font-family:Arial,Helvetica,sans-serif;font-size:17px;line-height:1.55;color:#4b5563;margin:0 0 26px 0;">${escapeHtml(address)}</div>` : ""}
                  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin:0 0 30px 0;">
                    <tr>
                      <td style="height:1px;line-height:1px;background:#e5e7eb;font-size:1px;">&nbsp;</td>
                    </tr>
                  </table>
                  <h2 style="margin:0 0 12px 0;font-family:Arial,Helvetica,sans-serif;font-size:13px;line-height:1.3;letter-spacing:.16em;text-transform:uppercase;color:${PIER_TEXT};font-weight:800;">Property Overview</h2>
                  ${description ? `<p style="margin:0 0 28px 0;font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:1.7;color:#374151;">${escapeHtml(description)}</p>` : ""}
                  ${tableRows(facts)}
                  ${suiteSummaryHtml(suites)}
                  ${highlights.length ? `<h2 style="margin:0 0 14px 0;font-family:Arial,Helvetica,sans-serif;font-size:13px;line-height:1.3;letter-spacing:.16em;text-transform:uppercase;color:${PIER_TEXT};font-weight:800;">Highlights</h2>${bulletsHtml(highlights)}` : ""}
                  <table role="presentation" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin:0 0 34px 0;">
                    <tr>
                      <td bgcolor="${PIER_ORANGE}" style="background:${PIER_ORANGE};border-radius:0;text-align:center;">
                        <a href="${escapeHtml(ctaUrl)}" style="display:inline-block;padding:16px 28px;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.2;color:#ffffff;text-decoration:none;font-weight:800;letter-spacing:.04em;text-transform:uppercase;">View PIER Listing Page</a>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>
              <tr>
                <td style="padding:28px 44px;background:#f8f8f8;border-top:1px solid #e5e7eb;">
                  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
                    <tr>
                      <td valign="top" style="font-family:Arial,Helvetica,sans-serif;font-size:13px;line-height:1.65;color:#4b5563;">
                        <img src="${escapeHtml(logoUrl)}" width="150" alt="PIER Commercial Real Estate" style="display:block;width:150px;max-width:150px;height:auto;border:0;margin:0 0 14px 0;">
                        <strong style="display:block;color:${PIER_TEXT};font-size:15px;">PIER Commercial Real Estate Brokerage</strong>
                        Savannah, Georgia<br>
                        <a href="https://www.piercommercial.com/" style="color:${PIER_ORANGE};text-decoration:none;font-weight:700;">piercommercial.com</a>
                      </td>
                      <td valign="top" align="right" style="font-family:Arial,Helvetica,sans-serif;font-size:13px;line-height:1.65;color:#4b5563;">
                        <strong style="display:block;color:${PIER_TEXT};font-size:15px;">${escapeHtml(broker.name)}</strong>
                        ${escapeHtml(broker.title)}<br>
                        <a href="mailto:${escapeHtml(broker.email)}" style="color:${PIER_ORANGE};text-decoration:none;font-weight:700;">${escapeHtml(broker.email)}</a><br>
                        ${escapeHtml(broker.phone)}
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
    </center>
  </body>
</html>`;
}
