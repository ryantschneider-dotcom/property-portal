import type { AuthSession } from "@/lib/auth";
import type { ProjectRecord } from "@/lib/projects-data";
import { buildOfferingSummaryDraft, type OfferingSummaryFact } from "@/lib/offering-summary";
import { formatAcreage, formatSquareFeet, listingFullAddress } from "@/lib/listing-utils";

export type BrokerProfile = {
  id: string;
  name: string;
  title: string;
  company: string;
  designations?: string;
  phone: string;
  email: string;
  headshotUrl: string;
};

export type OfferingSummaryPdfPage = "cover" | "summary" | "aerial-map" | "location-map" | "demographics";

export type DemographicTable = {
  title: "Population" | "Households & Income";
  columns: string[];
  rows: Array<{ label: string; values: string[] }>;
};

export type DemographicApiResponse = {
  sourceYear?: number;
  radii: number[];
  rows: Array<{ label: string; values: Array<{ radiusMiles: number; value: string }> }>;
};

export type OfferingSummaryPdfModel = {
  listing: ProjectRecord;
  title: string;
  subtitle: string;
  address: string;
  broker: BrokerProfile;
  heroImageUrl: string | null;
  propertyDescription: string;
  highlights: string[];
  offeringSummaryFacts: OfferingSummaryFact[];
  demographicsTables: DemographicTable[];
  aerialMapImageUrl: string | null;
  locationMapImageUrl: string | null;
  pageOrder: OfferingSummaryPdfPage[];
};

export type StaticMapProvider = "google" | "mapbox";

export type RetailerMapPoint = {
  name: string;
  lat: number;
  lng: number;
  placeId?: string;
  domain?: string;
};

export type RetailAerialMapPlan = {
  provider: StaticMapProvider;
  staticMapUrl: string;
  placesQuery: string;
  logoRequests: Array<{ retailer: string; url: string }>;
  overlays: Array<{ retailer: string; logoUrl: string; lat: number; lng: number; x: number; y: number }>;
};

export type PdfRenderOptions = {
  html: string;
  pdfOptions?: Record<string, unknown>;
};

export type PdfRenderer = (options: PdfRenderOptions) => Promise<Uint8Array>;

const BROKER_PROFILES: Record<string, BrokerProfile> = {
  ryan: {
    id: "ryan",
    name: "Ryan T. Schneider, CCIM",
    title: "President",
    company: "PIER Commercial Real Estate",
    designations: "CCIM",
    phone: "912.239.6298",
    email: "ryan@piercommercial.com",
    headshotUrl: "/brokers/ryan-schneider-updated-2024.jpg",
  },
  anthony: {
    id: "anthony",
    name: "Anthony Wagner",
    title: "Associate Broker",
    company: "PIER Commercial Real Estate",
    phone: "912.239.6297",
    email: "anthony@piercommercial.com",
    headshotUrl: "/brokers/anthony-wagner.jpg",
  },
  joel: {
    id: "joel",
    name: "Joel Boblasky",
    title: "Associate Broker",
    company: "PIER Commercial Real Estate",
    phone: "912.239.6299",
    email: "joel@piercommercial.com",
    headshotUrl: "/brokers/joel-boblasky.jpg",
  },
};

function normalizeBrokerId(value?: string | null) {
  const normalized = value?.toLowerCase().replace(/[^a-z]+/g, " ").trim() || "";
  if (/anthony|wagner/.test(normalized)) return "anthony";
  if (/joel|boblasky/.test(normalized)) return "joel";
  if (/ryan|schneider/.test(normalized)) return "ryan";
  return normalized in BROKER_PROFILES ? normalized : "ryan";
}

export function getBrokerProfileForSession(session: AuthSession | null | undefined): BrokerProfile {
  return BROKER_PROFILES[normalizeBrokerId(session?.brokerId)];
}

function escapeHtml(value: string) {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
}

function valueOrTbd(value: string | null | undefined) {
  return value && value.trim() ? value : "TBD";
}

function buildPdfFacts(listing: ProjectRecord, draftFacts: OfferingSummaryFact[]) {
  const facts = new Map(draftFacts.map((fact) => [fact.label, fact.value]));
  return [
    { label: "Lease Rate", value: valueOrTbd(listing.leaseRate) },
    { label: "Offering Price", value: valueOrTbd(facts.get("Offering Price")) },
    { label: "Number of Units", value: listing.units ? String(listing.units) : "1" },
    { label: "Available SF", value: formatSquareFeet(listing.size) },
    { label: "Lot Size", value: formatAcreage(listing.acreage) },
    { label: "Building Size", value: formatSquareFeet(listing.size) },
    { label: "Zoning", value: valueOrTbd(listing.zoningDistrict) },
    { label: "Parcel ID", value: valueOrTbd(listing.parcelId) },
  ];
}

export function buildDemographicsTablesFromCensusResponse(response?: DemographicApiResponse | null): DemographicTable[] {
  const columns = (response?.radii?.length ? response.radii : [1, 3, 5]).map((radius) => `${radius} ${radius === 1 ? "MILE" : "MILES"}`);
  const rowByLabel = new Map((response?.rows || []).map((row) => [row.label.toLowerCase(), row]));

  const valuesFor = (labels: string[]) => {
    const source = labels.map((label) => rowByLabel.get(label.toLowerCase())).find(Boolean);
    if (!source) return columns.map(() => "—");
    return (response?.radii || [1, 3, 5]).map((radius) => source.values.find((item) => item.radiusMiles === radius)?.value || "—");
  };

  return [
    {
      title: "Population",
      columns,
      rows: [
        { label: "Total Population", values: valuesFor(["Total Population", "Population"]) },
        { label: "Average Age", values: valuesFor(["Average Age", "Median Age"]) },
      ],
    },
    {
      title: "Households & Income",
      columns,
      rows: [
        { label: "Total Households", values: valuesFor(["Total Households", "Households"]) },
        { label: "Average HH Income", values: valuesFor(["Average HH Income", "Median Household Income", "Household Income"]) },
      ],
    },
  ];
}

export function buildOfferingSummaryPdfModel(input: {
  listing: ProjectRecord;
  broker: BrokerProfile;
  heroImageUrl?: string | null;
  demographics?: DemographicApiResponse | null;
  aerialMapImageUrl?: string | null;
  locationMapImageUrl?: string | null;
}): OfferingSummaryPdfModel {
  const draft = buildOfferingSummaryDraft(input.listing);
  const address = listingFullAddress(input.listing) || "Address to be confirmed";
  const highlights = draft.highlights.length ? draft.highlights : [draft.executiveSummary];

  return {
    listing: input.listing,
    title: draft.title,
    subtitle: `${input.listing.propertyType || "Commercial Real Estate"} · ${address}`,
    address,
    broker: input.broker,
    heroImageUrl: input.heroImageUrl || null,
    propertyDescription: input.listing.description || input.listing.marketingBlurb || draft.executiveSummary,
    highlights,
    offeringSummaryFacts: buildPdfFacts(input.listing, draft.facts),
    demographicsTables: buildDemographicsTablesFromCensusResponse(input.demographics),
    aerialMapImageUrl: input.aerialMapImageUrl || null,
    locationMapImageUrl: input.locationMapImageUrl || null,
    pageOrder: ["cover", "summary", "aerial-map", "location-map", "demographics"],
  };
}

function renderFactBox(facts: OfferingSummaryFact[]) {
  return facts.map((fact) => `<div class="fact"><span>${escapeHtml(fact.label)}</span><strong>${escapeHtml(fact.value)}</strong></div>`).join("");
}

function renderTable(table: DemographicTable) {
  const head = table.columns.map((column) => `<th>${escapeHtml(column)}</th>`).join("");
  const rows = table.rows.map((row) => `<tr><td>${escapeHtml(row.label)}</td>${row.values.map((value) => `<td>${escapeHtml(value)}</td>`).join("")}</tr>`).join("");
  return `<section class="demographic-table"><h2>${escapeHtml(table.title)}</h2><table><thead><tr><th></th>${head}</tr></thead><tbody>${rows}</tbody></table></section>`;
}

export function renderOfferingSummaryHtml(model: OfferingSummaryPdfModel) {
  const hero = model.heroImageUrl ? `<img class="hero-image" src="${escapeHtml(model.heroImageUrl)}" alt="${escapeHtml(model.title)}" />` : `<div class="hero-placeholder">PIER COMMERCIAL</div>`;
  const aerial = model.aerialMapImageUrl ? `<img class="map-page-image" src="${escapeHtml(model.aerialMapImageUrl)}" alt="Retail aerial map" />` : `<div class="map-placeholder">Retail aerial map will render here</div>`;
  const location = model.locationMapImageUrl ? `<img class="map-page-image" src="${escapeHtml(model.locationMapImageUrl)}" alt="Location map" />` : `<div class="map-placeholder">Location map will render here</div>`;

  return `<!doctype html>
<html><head><meta charset="utf-8" /><style>
  @page { size: Letter; margin: 0; }
  body { margin: 0; font-family: Arial, Helvetica, sans-serif; color: #1f2933; }
  .page { break-after: page; min-height: 11in; padding: .48in; box-sizing: border-box; position: relative; }
  .brand { color: #CB521E; letter-spacing: .22em; font-size: 11px; text-transform: uppercase; font-weight: 700; }
  .cover-title { position: absolute; bottom: .6in; left: .48in; right: .48in; color: white; text-shadow: 0 2px 10px rgba(0,0,0,.45); }
  .hero-image, .map-page-image { width: 100%; height: 7.3in; object-fit: cover; border-radius: 14px; }
  .hero-placeholder, .map-placeholder { height: 7.3in; border-radius: 14px; background: linear-gradient(135deg,#111827,#CB521E); color: white; display: grid; place-items: center; letter-spacing: .18em; }
  .two-col { display: grid; grid-template-columns: 1fr .76fr; gap: 28px; }
  .facts { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
  .fact { border: 1px solid #d8dde3; border-radius: 10px; padding: 10px; }
  .fact span { display:block; font-size: 9px; text-transform: uppercase; color:#667085; letter-spacing:.12em; }
  .fact strong { display:block; margin-top:4px; font-size:14px; }
  .broker-card { position:absolute; left:.48in; right:.48in; bottom:.45in; display:flex; gap:14px; align-items:center; border-top:2px solid #CB521E; padding-top:14px; }
  .broker-headshot { width: 74px; height: 74px; object-fit: cover; border-radius: 999px; border: 2px solid #CB521E; }
  h1 { font-size: 34px; line-height:1.05; margin: 14px 0 8px; text-transform: uppercase; }
  h2 { color:#CB521E; font-size:15px; letter-spacing:.16em; text-transform:uppercase; }
  p, li { font-size: 12px; line-height: 1.65; }
  table { width: 100%; border-collapse: collapse; margin-top: 10px; } th, td { border-bottom: 1px solid #e4e7ec; padding: 9px; font-size: 12px; text-align: right; } th:first-child, td:first-child { text-align:left; }
</style></head><body>
  <section class="page cover">${hero}<div class="cover-title"><div class="brand">${escapeHtml(model.listing.propertyType || "Offering Summary")}</div><h1>${escapeHtml(model.listing.name)}</h1><p>${escapeHtml(model.address)}</p></div>${renderBrokerCard(model.broker)}</section>
  <section class="page"><div class="brand">Offering Summary</div><h1>${escapeHtml(model.listing.name)}</h1><div class="two-col"><main><h2>Property Description</h2><p>${escapeHtml(model.propertyDescription)}</p><h2>Property Highlights</h2><ul>${model.highlights.map((h) => `<li>${escapeHtml(h)}</li>`).join("")}</ul></main><aside><h2>Offering Summary</h2><div class="facts">${renderFactBox(model.offeringSummaryFacts)}</div></aside></div>${renderBrokerCard(model.broker)}</section>
  <section class="page"><div class="brand">Retail Aerial Map</div><h1>Retail Aerial</h1>${aerial}${renderBrokerCard(model.broker)}</section>
  <section class="page"><div class="brand">Map Pages</div><h1>Location Map</h1>${location}${renderBrokerCard(model.broker)}</section>
  <section class="page"><div class="brand">Demographics</div><h1>Demographics</h1>${model.demographicsTables.map(renderTable).join("")}<p>Source: US Census Bureau ACS radius estimates where available.</p>${renderBrokerCard(model.broker)}</section>
</body></html>`;
}

function renderBrokerCard(broker: BrokerProfile) {
  return `<footer class="broker-card"><img class="broker-headshot" src="${escapeHtml(broker.headshotUrl)}" alt="${escapeHtml(broker.name)}" /><div><strong>${escapeHtml(broker.name)}</strong><br/><span>${escapeHtml(broker.title)} · ${escapeHtml(broker.company)}</span><br/><span>${escapeHtml(broker.phone)} · ${escapeHtml(broker.email)}</span></div></footer>`;
}

function domainForRetailer(name: string) {
  const normalized = name.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  const known: Record<string, string> = {
    starbucks: "starbucks.com",
    target: "target.com",
    walmart: "walmart.com",
    kroger: "kroger.com",
    publix: "publix.com",
    costco: "costco.com",
    lowes: "lowes.com",
    "home depot": "homedepot.com",
    mcdonalds: "mcdonalds.com",
    chipotle: "chipotle.com",
  };
  return known[normalized] || `${normalized.split(" ")[0]}.com`;
}

function projectPointToPixel(point: { lat: number; lng: number }, center: { lat: number; lng: number }, zoom: number, size: { width: number; height: number }) {
  const scale = 256 * 2 ** zoom;
  const mercator = ({ lat, lng }: { lat: number; lng: number }) => {
    const sin = Math.sin((lat * Math.PI) / 180);
    return { x: ((lng + 180) / 360) * scale, y: (0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI)) * scale };
  };
  const c = mercator(center);
  const p = mercator(point);
  return { x: Math.round(size.width / 2 + (p.x - c.x)), y: Math.round(size.height / 2 + (p.y - c.y)) };
}

export function buildRetailAerialMapPlan(input: {
  center: { lat: number; lng: number };
  zoom?: number;
  size?: { width: number; height: number };
  provider?: StaticMapProvider;
  retailers?: RetailerMapPoint[];
  mapboxToken?: string;
  googleMapsApiKey?: string;
}): RetailAerialMapPlan {
  const provider = input.provider || (input.mapboxToken ? "mapbox" : "google");
  const zoom = input.zoom ?? 16;
  const size = input.size || { width: 1600, height: 1000 };
  const center = input.center;
  const staticMapUrl = provider === "mapbox"
    ? `https://api.mapbox.com/styles/v1/mapbox/satellite-v9/static/${center.lng},${center.lat},${zoom}/${size.width}x${size.height}@2x?access_token=${input.mapboxToken || "MAPBOX_TOKEN"}`
    : `https://maps.googleapis.com/maps/api/staticmap?center=${center.lat},${center.lng}&zoom=${zoom}&size=${size.width}x${size.height}&scale=2&maptype=satellite&key=${input.googleMapsApiKey || "GOOGLE_MAPS_API_KEY"}`;

  const overlays = (input.retailers || []).map((retailer) => {
    const domain = retailer.domain || domainForRetailer(retailer.name);
    const logoUrl = `https://logo.clearbit.com/${domain}`;
    const pixel = projectPointToPixel(retailer, center, zoom, size);
    return { retailer: retailer.name, logoUrl, lat: retailer.lat, lng: retailer.lng, ...pixel };
  });

  return {
    provider,
    staticMapUrl,
    placesQuery: `major retailers and anchor tenants near ${center.lat},${center.lng}`,
    logoRequests: overlays.map((overlay) => ({ retailer: overlay.retailer, url: overlay.logoUrl })),
    overlays,
  };
}

export async function defaultPuppeteerPdfRenderer({ html, pdfOptions }: PdfRenderOptions): Promise<Uint8Array> {
  const puppeteer = await import("puppeteer-core");
  const browser = await puppeteer.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: "load" });
    const pdf = await page.pdf({ format: "Letter", printBackground: true, ...(pdfOptions || {}) });
    return new Uint8Array(pdf);
  } finally {
    await browser.close();
  }
}

export async function generateOfferingSummaryPdf(model: OfferingSummaryPdfModel, renderer: PdfRenderer = defaultPuppeteerPdfRenderer) {
  return renderer({ html: renderOfferingSummaryHtml(model), pdfOptions: { format: "Letter", printBackground: true } });
}

async function fetchImageBuffer(url: string) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Could not fetch image asset (${response.status}) for ${url}`);
  return Buffer.from(await response.arrayBuffer());
}

export async function composeRetailAerialMap(plan: RetailAerialMapPlan) {
  const sharp = (await import("sharp")).default;
  const base = sharp(await fetchImageBuffer(plan.staticMapUrl));
  const composites = await Promise.all(plan.overlays.map(async (overlay) => ({
    input: await sharp(await fetchImageBuffer(overlay.logoUrl))
      .resize({ width: 132, height: 72, fit: "inside", background: { r: 255, g: 255, b: 255, alpha: 0 } })
      .png()
      .toBuffer(),
    left: Math.round(overlay.x - 66),
    top: Math.round(overlay.y - 36),
  })));

  return base.composite(composites).png().toBuffer();
}
