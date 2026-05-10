import "server-only";

import { FieldValue } from "firebase-admin/firestore";

import { syncPropertyToAscendix } from "@/lib/ascendix-sync";
import { getCountyEnrichmentPlan } from "@/lib/broker-hub-shared";
import { db, PROPERTIES_COLLECTION } from "@/lib/firestore";
import type { PortalSession } from "@/lib/portal-session";
import { isAdminPortalRole } from "@/lib/users";
import { getPropertyBySlug } from "@/lib/properties";
import { buildExportConsoleItem, shouldIncludeInExportConsole } from "@/lib/export-console";
import type { ExportConsoleItem } from "@/lib/export-console";
import type { PropertyDetail } from "@/lib/types";

export type AdminPropertyListItem = {
  id: string;
  documentId: string;
  slug: string;
  title: string;
  address: string | null;
  transactionLabel: string | null;
  parcelId: string | null;
  zoning: string | null;
  imageUrl: string | null;
  updatedAt: string | null;
  ownerEmail: string | null;
  workflowStatus: string | null;
  approvalStatus: string | null;
  rejectionReason: string | null;
  decisionNote: string | null;
  enrichmentStatus: string | null;
  countyRoutingStatus: string | null;
  countyRoutingSource: string | null;
  reviewState: "ready" | "needs_manual_followup" | "blocked";
  missingFieldCount: number;
  blockedIssueCount: number;
  buildoutReady: boolean;
  launchPackageStatus: string | null;
  exportWorkflowStatus: string | null;
  exportDestination: string | null;
  exportReadyReasons: string[];
  exportBlockingReasons: string[];
  exportWarningReasons: string[];
  exportCount: number;
  lastExportResult: string | null;
  lastExportErrorMessage: string | null;
  revisionWorkflow: {
    currentRequest: {
      id: string | null;
      status: string | null;
      summary: string | null;
      createdAt: string | null;
      categories: Array<{
        code: string;
        title: string;
        severity: "warning" | "blocker";
        items: string[];
      }>;
    } | null;
    historyCount: number;
  };
};

export type BrokerCountyHealthItem = {
  county: string;
  assessorSource: string;
  routingStatus: string;
  liveStatus: string | null;
  health: "healthy" | "degraded" | "pending" | "unknown";
  detail: string;
  updatedAt: string | null;
};

export type BrokerCountyHealthSnapshot = {
  overallHealth: "healthy" | "degraded" | "pending" | "unknown";
  headline: string;
  detail: string;
  items: BrokerCountyHealthItem[];
};

export type AdminPropertyFormData = {
  id?: string;
  slug: string;
  title: string;
  listingStatus: "active" | "inactive" | "leased" | "sold";
  transactionType: "sale" | "lease" | "sale-lease";
  websiteUrl: string;
  leadBroker: string;

  addressStreet: string;
  addressFull: string;
  city: string;
  state: string;
  zip: string;
  county: string;
  latitude: string;
  longitude: string;
  neighborhood: string;
  corridor: string;
  anchorTenants: string;
  nearbyRestaurants: string;
  nearbyBanks: string;

  saleTitle: string;
  salePriceDollars: string;
  hiddenPriceLabel: string;
  hideSalePrice: boolean;
  listingPriceVisibility: string;
  askingPriceRate: string;
  availableSf: string;
  leaseType: string;

  propertyTypeId: string;
  propertySubtypeId: string;
  propertyTypeLabel: string;
  buildingSizeSf: string;
  lotSizeAcres: string;
  yearBuilt: string;
  zoning: string;
  parcelId: string;
  parking: string;
  exteriorConstructionType: string;
  propertyClass: string;
  assessorImprovements: string;

  saleDescription: string;
  leaseDescription: string;
  locationDescription: string;
  exteriorDescription: string;
  saleBullets: string;
  leaseBullets: string;
};

function asString(value: unknown): string {
  return value == null ? "" : String(value);
}

function cleanDisplayText(value: unknown): string {
  const text = asString(value).trim();
  if (!text) return "";
  if (text === "0" || text === "0.0" || text === "0.00") return "";
  if (["n/a", "na", "null", "undefined"].includes(text.toLowerCase())) return "";
  return text;
}

function formatNumberString(value: unknown, decimals?: number): string {
  const text = cleanDisplayText(value);
  if (!text) return "";
  const num = Number(text);
  if (!Number.isFinite(num)) return text;
  if (decimals == null) return String(num);
  return num.toFixed(decimals).replace(/\.0+$|(?<=\.[0-9]*?)0+$/g, "").replace(/\.$/, "");
}

function splitLines(values: string): string[] {
  return values
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function splitBullets(values: string): string[] {
  return splitLines(values);
}

function parseOptionalNumber(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const num = Number(trimmed);
  return Number.isFinite(num) ? num : null;
}

function visibilityFromTransaction(transactionType: AdminPropertyFormData["transactionType"]) {
  if (transactionType === "sale") {
    return { transactionLabel: "For Sale", saleActive: true, leaseActive: false };
  }
  if (transactionType === "lease") {
    return { transactionLabel: "For Lease", saleActive: false, leaseActive: true };
  }
  return { transactionLabel: "For Sale/Lease", saleActive: true, leaseActive: true };
}

function inferCategory(existing?: PropertyDetail | null): string | null {
  return existing?.property.category ?? null;
}

export async function listAdminProperties(session?: PortalSession | null): Promise<AdminPropertyListItem[]> {
  const snapshot = await db.collection(PROPERTIES_COLLECTION).get();
  return snapshot.docs
    .map((doc) => {
      const data = doc.data() as Record<string, unknown>;
      const address = (data.address as Record<string, unknown> | undefined) ?? {};
      const visibility = (data.visibility as Record<string, unknown> | undefined) ?? {};
      const property = (data.property as Record<string, unknown> | undefined) ?? {};
      const meta = (data.meta as Record<string, unknown> | undefined) ?? {};
      const media = (data.media as Record<string, unknown> | undefined) ?? {};
      const approval = (meta.approval as Record<string, unknown> | undefined) ?? {};
      const enrichment = (meta.enrichment as Record<string, unknown> | undefined) ?? {};
      const countyRouting = (enrichment.countyRouting as Record<string, unknown> | undefined) ?? {};
      const images = (media.images as Array<Record<string, unknown>> | undefined) ?? [];
      const research = (meta.research as Record<string, unknown> | undefined) ?? {};
      const publicRecords = (research.public_records as Record<string, unknown> | undefined) ?? {};
      const places = (research.places as Record<string, unknown> | undefined) ?? {};
      const streetView = (research.street_view as Record<string, unknown> | undefined) ?? {};
      const exportMeta = (meta.export as Record<string, unknown> | undefined) ?? {};
      const launchPackage = (meta.launchPackage as Record<string, unknown> | undefined) ?? {};
      const exportWorkflow = (meta.exportWorkflow as Record<string, unknown> | undefined) ?? {};
      const lastExportAttempt = (exportWorkflow.lastExportAttempt as Record<string, unknown> | undefined) ?? {};
      const revisionWorkflow = (meta.revisionWorkflow as Record<string, unknown> | undefined) ?? {};
      const currentRevisionRequest = (revisionWorkflow.currentRequest as Record<string, unknown> | undefined) ?? null;
      const primaryImage = images.find((image) => image?.isPrimary === true) ?? images[0] ?? {};
      const primaryUrls = (primaryImage.urls as Record<string, unknown> | undefined) ?? {};
      const imageUrl = cleanDisplayText(
        media.heroImageUrl ?? primaryUrls.large ?? primaryUrls.medium ?? primaryUrls.thumb,
      );
      const missingFieldCount = Array.isArray(enrichment.missingFields) ? enrichment.missingFields.length : 0;
      const blockedIssueCount = [publicRecords.status, places.status, streetView.status].filter((status) => ["blocked", "error", "login_gated", "no_results"].includes(asString(status))).length
        + (Array.isArray(enrichment.launchpadErrors) ? enrichment.launchpadErrors.length : 0);
      const extractedFields = (enrichment.extractedFields as Record<string, unknown> | undefined) ?? {};
      const extractedFieldCount = [extractedFields.buildingSizeSf, extractedFields.lotSizeAcres, extractedFields.zoning, extractedFields.aiDraft].filter((value) => value === true).length;
      const buildoutReady = exportMeta.buildoutReady === true;
      const thinExtraction = asString(enrichment.status) === "partial" || extractedFieldCount < 2 || missingFieldCount >= 2;
      const reviewState = blockedIssueCount > 0 ? "blocked" : (thinExtraction || !buildoutReady) ? "needs_manual_followup" : "ready";
      return {
        id: doc.id,
        documentId: doc.id,
        slug: asString(data.slug),
        title: asString(data.title) || "Untitled Property",
        address: asString(address.full || address.street) || null,
        transactionLabel: asString(visibility.transactionLabel) || null,
        parcelId: asString(property.parcelId) || null,
        zoning: asString(property.zoning) || null,
        imageUrl: imageUrl || null,
        updatedAt: asString(meta.updatedAt) || null,
        ownerEmail: asString(data.ownerEmail || data.ownerUserId) || null,
        workflowStatus: asString(data.workflowStatus) || null,
        approvalStatus: asString(approval.status) || null,
        rejectionReason: asString(approval.rejectionReason) || null,
        decisionNote: asString(approval.decisionNote) || null,
        enrichmentStatus: asString(enrichment.status) || null,
        countyRoutingStatus: asString(countyRouting.status) || null,
        countyRoutingSource: asString(countyRouting.assessorSource) || null,
        reviewState,
        missingFieldCount,
        blockedIssueCount,
        buildoutReady,
        launchPackageStatus: asString(launchPackage.status) || null,
        exportWorkflowStatus: asString(exportWorkflow.status) || null,
        exportDestination: asString(exportWorkflow.destination) || null,
        exportReadyReasons: Array.isArray(exportWorkflow.readyReasons) ? exportWorkflow.readyReasons.map((item) => asString(item)).filter(Boolean) : [],
        exportBlockingReasons: Array.isArray(exportWorkflow.blockingReasons) ? exportWorkflow.blockingReasons.map((item) => asString(item)).filter(Boolean) : [],
        exportWarningReasons: Array.isArray(exportWorkflow.warningReasons) ? exportWorkflow.warningReasons.map((item) => asString(item)).filter(Boolean) : [],
        exportCount: Number(exportWorkflow.exportCount ?? 0) || 0,
        lastExportResult: asString(lastExportAttempt.result) || null,
        lastExportErrorMessage: asString(lastExportAttempt.errorMessage) || null,
        revisionWorkflow: {
          currentRequest: currentRevisionRequest
            ? {
                id: asString(currentRevisionRequest.id) || null,
                status: asString(currentRevisionRequest.status) || null,
                summary: asString(currentRevisionRequest.summary) || null,
                createdAt: asString(currentRevisionRequest.createdAt) || null,
                categories: Array.isArray(currentRevisionRequest.categories)
                  ? currentRevisionRequest.categories.map((category) => ({
                      code: asString((category as Record<string, unknown>).code) || "",
                      title: asString((category as Record<string, unknown>).title) || asString((category as Record<string, unknown>).code) || "",
                      severity: (category as Record<string, unknown>).severity === "warning" ? "warning" : "blocker",
                      items: Array.isArray((category as Record<string, unknown>).items)
                        ? ((category as Record<string, unknown>).items as unknown[]).map((item) => asString(item)).filter(Boolean)
                        : [],
                    }))
                  : [],
              }
            : null,
          historyCount: Array.isArray(revisionWorkflow.history) ? revisionWorkflow.history.length : 0,
        },
      } satisfies AdminPropertyListItem;
    })
    .filter((property) => {
      if (!session || isAdminPortalRole(session.role)) return true;
      return property.ownerEmail?.toLowerCase() === session.email.toLowerCase();
    })
    .sort((a, b) => a.title.localeCompare(b.title));
}

export async function listExportConsoleItems(session?: PortalSession | null): Promise<ExportConsoleItem[]> {
  const properties = await listAdminProperties(session);

  return properties
    .filter((property) => shouldIncludeInExportConsole({ workflowStatus: property.workflowStatus }))
    .map((property) => buildExportConsoleItem(property))
    .sort((a, b) => (b.updatedAt || "").localeCompare(a.updatedAt || ""));
}

function healthFromLiveStatus(input: {
  routingStatus: string;
  canScrapeTaxCard: boolean;
  liveStatus: string | null;
  enrichmentStatus: string | null;
  hasError: boolean;
}) {
  if (!input.canScrapeTaxCard || input.routingStatus === "pending-mapper") return "pending" as const;
  if (input.hasError) return "degraded" as const;
  if (["ok", "completed"].includes((input.liveStatus || "").toLowerCase())) return "healthy" as const;
  if (["error", "blocked", "login_gated", "no_results"].includes((input.liveStatus || "").toLowerCase())) return "degraded" as const;
  if (["queued", "partial"].includes((input.enrichmentStatus || "").toLowerCase())) return "pending" as const;
  return "unknown" as const;
}

export async function getBrokerCountyHealthSnapshot(): Promise<BrokerCountyHealthSnapshot> {
  const snapshot = await db.collection(PROPERTIES_COLLECTION).get();
  const byCounty = new Map<string, BrokerCountyHealthItem>();

  for (const doc of snapshot.docs) {
    const data = doc.data() as Record<string, unknown>;
    const address = (data.address as Record<string, unknown> | undefined) ?? {};
    const meta = (data.meta as Record<string, unknown> | undefined) ?? {};
    const enrichment = (meta.enrichment as Record<string, unknown> | undefined) ?? {};
    const research = (meta.research as Record<string, unknown> | undefined) ?? {};
    const publicRecords = (research.public_records as Record<string, unknown> | undefined) ?? {};
    const county = asString(address.county || ((meta.intake as Record<string, unknown> | undefined) ?? {}).county);
    if (!county) continue;

    const existing = byCounty.get(county);
    const updatedAt = asString(meta.updatedAt) || asString(data.updatedAt);
    if (existing?.updatedAt && updatedAt && existing.updatedAt > updatedAt) {
      continue;
    }

    const plan = getCountyEnrichmentPlan(county);
    const liveStatus = asString(publicRecords.assessor_status || publicRecords.status);
    const hasError = Boolean(asString(publicRecords.error)) || (Array.isArray(enrichment.launchpadErrors) && enrichment.launchpadErrors.length > 0);
    const health = healthFromLiveStatus({
      routingStatus: plan.status,
      canScrapeTaxCard: plan.canScrapeTaxCard,
      liveStatus,
      enrichmentStatus: asString(enrichment.status),
      hasError,
    });

    const detail = [
      plan.assessorSource !== "unmapped" ? plan.assessorSource : null,
      liveStatus || plan.status,
      asString(publicRecords.error),
    ].filter(Boolean).join(" · ");

    byCounty.set(county, {
      county,
      assessorSource: plan.assessorSource,
      routingStatus: plan.status,
      liveStatus,
      health,
      detail: detail || plan.notes,
      updatedAt,
    });
  }

  const items = Array.from(byCounty.values()).sort((a, b) => {
    const aTime = a.updatedAt ? Date.parse(a.updatedAt) : 0;
    const bTime = b.updatedAt ? Date.parse(b.updatedAt) : 0;
    return bTime - aTime || a.county.localeCompare(b.county);
  }).slice(0, 6);

  const healthyCount = items.filter((item) => item.health === "healthy").length;
  const degradedItems = items.filter((item) => item.health === "degraded");
  const pendingItems = items.filter((item) => item.health === "pending");
  const degradedCount = degradedItems.length;
  const pendingCount = pendingItems.length;

  const overallHealth = degradedCount
    ? "degraded"
    : healthyCount
      ? "healthy"
      : pendingCount
        ? "pending"
        : "unknown";

  const namedDegraded = degradedItems.map((item) => `${item.county} (${item.assessorSource})`);
  const namedPending = pendingItems.map((item) => `${item.county} (${item.assessorSource})`);

  const headline = !items.length
    ? "County enrichment: no live checks yet"
    : degradedItems.length
      ? `County enrichment alert: ${namedDegraded.slice(0, 2).join(", ")}${namedDegraded.length > 2 ? ` +${namedDegraded.length - 2} more` : ""}`
      : pendingItems.length
        ? `County enrichment pending: ${namedPending.slice(0, 2).join(", ")}${namedPending.length > 2 ? ` +${namedPending.length - 2} more` : ""}`
        : `County enrichment healthy: ${healthyCount} recent county check${healthyCount === 1 ? "" : "s"}`;

  const detail = !items.length
    ? "No broker draft has produced a county scraper result yet."
    : degradedItems.length
      ? `${namedDegraded.slice(0, 3).join(", ")} needs attention or may be offline based on the latest live scraper result.`
      : pendingItems.length
        ? `${namedPending.slice(0, 3).join(", ")} is still pending mapper coverage or a fresh successful county check.`
        : "Latest county scraper results from recent listing drafts look healthy.";

  return { overallHealth, headline, detail, items };
}

export function buildEmptyAdminFormData(): AdminPropertyFormData {
  return {
    slug: "",
    title: "",
    listingStatus: "active",
    transactionType: "sale",
    websiteUrl: "",
    leadBroker: "",

    addressStreet: "",
    addressFull: "",
    city: "",
    state: "GA",
    zip: "",
    county: "",
    latitude: "",
    longitude: "",
    neighborhood: "",
    corridor: "",
    anchorTenants: "",
    nearbyRestaurants: "",
    nearbyBanks: "",

    saleTitle: "",
    salePriceDollars: "",
    hiddenPriceLabel: "",
    hideSalePrice: false,
    listingPriceVisibility: "",
    askingPriceRate: "",
    availableSf: "",
    leaseType: "",

    propertyTypeId: "",
    propertySubtypeId: "",
    propertyTypeLabel: "",
    buildingSizeSf: "",
    lotSizeAcres: "",
    yearBuilt: "",
    zoning: "",
    parcelId: "",
    parking: "",
    exteriorConstructionType: "",
    propertyClass: "",
    assessorImprovements: "",

    saleDescription: "",
    leaseDescription: "",
    locationDescription: "",
    exteriorDescription: "",
    saleBullets: "",
    leaseBullets: "",
  };
}

function adminListingStatusFromStored(value: unknown): AdminPropertyFormData["listingStatus"] {
  const status = asString(value).trim().toLowerCase();
  if (status === "inactive") return "inactive";
  if (status === "leased") return "leased";
  if (status === "sold") return "sold";
  return "active";
}

export async function getAdminPropertyFormData(slug: string): Promise<AdminPropertyFormData | null> {
  const property = await getPropertyBySlug(slug);
  if (!property) return null;

  const rawDoc = await db.collection(PROPERTIES_COLLECTION).doc(property.id).get();
  const raw = (rawDoc.data() as Record<string, any> | undefined) ?? {};
  const meta = raw.meta ?? {};
  const intake = meta.intake ?? {};
  const research = meta.research ?? {};
  const places = research.places ?? {};
  const publicRecords = research.public_records ?? {};
  const rawProperty = raw.property ?? {};
  const rawPricing = raw.pricing ?? {};
  const rawLinks = raw.links ?? {};
  const rawContent = raw.content ?? {};

  const transactionType =
    property.transactionTypes.length === 2
      ? "sale-lease"
      : property.transactionTypes[0] === "lease"
        ? "lease"
        : "sale";

  return {
    id: property.id,
    slug: property.slug,
    title: property.title,
    listingStatus: adminListingStatusFromStored(raw.status),
    transactionType,
    websiteUrl: asString(rawLinks.websiteUrl || meta.websiteUrl || intake.website_url || intake["Website URL (If applicable)"]),
    leadBroker: asString(raw.leadBroker || raw.admin?.leadBroker || intake.lead_broker || intake["Lead Broker"]),

    addressStreet: property.address.street ?? asString(intake.street_number && intake.street_name ? `${intake.street_number} ${intake.street_name}` : ""),
    addressFull: property.address.full ?? asString(rawProperty.address),
    city: property.address.city ?? asString(rawProperty.city || intake.city || intake["City"]),
    state: property.address.state ?? asString(rawProperty.state || intake.state || intake["State"]),
    zip: property.address.zip ?? asString(rawProperty.zip || intake.zip_code || intake["Zip Code"]),
    county: property.address.county ?? asString(rawProperty.county || intake.county || intake["County"]),
    latitude: asString(property.location.lat || rawProperty.latitude || intake.map_coordinates?.lat),
    longitude: asString(property.location.lng || rawProperty.longitude || intake.map_coordinates?.lng),
    neighborhood: asString(places.neighborhood),
    corridor: asString(places.corridor),
    anchorTenants: asString((places.anchor_tenants ?? []).join("\n")),
    nearbyRestaurants: asString((places.restaurants ?? []).join("\n")),
    nearbyBanks: asString((places.banks ?? []).join("\n")),

    saleTitle: cleanDisplayText(rawContent.saleTitle || rawProperty.sale_title || meta.copy?.sale_title),
    salePriceDollars: formatNumberString(property.pricing.salePriceDollars || intake.listing_price_amount || intake["Listing Price Amount (Leave blank if undisclosed)"]),
    hiddenPriceLabel: cleanDisplayText(property.pricing.hiddenPriceLabel ?? rawProperty.hidden_price_label),
    hideSalePrice: property.pricing.hideSalePrice === true || rawProperty.hide_sale_price === true,
    listingPriceVisibility: cleanDisplayText(intake.listing_price_visibility || intake["Listing Price Visibility"]),
    askingPriceRate: formatNumberString(intake.asking_price_rate || intake["Asking Price/Lease Rate/per sf"]),
    availableSf: formatNumberString(intake.available_sf || intake["Available Sq. Ft."]),
    leaseType: cleanDisplayText(intake.lease_type || intake["Lease Type"]),

    propertyTypeId: cleanDisplayText(rawProperty.property_type_id),
    propertySubtypeId: cleanDisplayText(rawProperty.property_subtype_id || meta.copy?.property_subtype_id),
    propertyTypeLabel: cleanDisplayText(intake.property_type || intake["Property Type"]),
    buildingSizeSf: formatNumberString(property.property.buildingSizeSf || rawProperty.building_size_sf || publicRecords.building_size_sf),
    lotSizeAcres: formatNumberString(property.property.lotSizeAcres || rawProperty.lot_size_acres || publicRecords.lot_size_acres, 4),
    yearBuilt: formatNumberString(property.property.yearBuilt || rawProperty.year_built || publicRecords.year_built),
    zoning: cleanDisplayText(property.property.zoning ?? rawProperty.zoning ?? publicRecords.zoning),
    parcelId: cleanDisplayText(property.property.parcelId ?? intake.parcel_id ?? intake.tax_id ?? intake["Tax ID #/Map ID #"]),
    parking: cleanDisplayText(publicRecords.parking),
    exteriorConstructionType: cleanDisplayText(publicRecords.exterior_construction_type),
    propertyClass: cleanDisplayText(publicRecords.property_class),
    assessorImprovements: cleanDisplayText((publicRecords.assessor_improvements ?? []).join("\n")),

    saleDescription: cleanDisplayText(property.content.saleDescription ?? rawProperty.sale_description ?? meta.copy?.sale_description),
    leaseDescription: cleanDisplayText(property.content.leaseDescription ?? ""),
    locationDescription: cleanDisplayText(property.content.locationDescription ?? rawProperty.location_description ?? meta.copy?.location_description),
    exteriorDescription: cleanDisplayText(property.content.exteriorDescription ?? rawProperty.exterior_description ?? meta.copy?.exterior_description),
    saleBullets: (property.content.saleBullets ?? rawProperty.sale_bullets ?? meta.copy?.sale_bullets ?? []).join("\n"),
    leaseBullets: (property.content.leaseBullets ?? []).join("\n"),
  };
}

export async function saveAdminProperty(input: AdminPropertyFormData) {
  const slug = input.slug.trim();
  if (!slug) {
    throw new Error("Slug is required");
  }

  const docId = input.id?.trim() || slug;
  const existing = await getPropertyBySlug(slug);
  const visibility = visibilityFromTransaction(input.transactionType);

  const payload = {
    slug,
    title: input.title.trim(),
    status: input.listingStatus,
    visibility,
    leadBroker: input.leadBroker.trim() || null,
    address: {
      full: input.addressFull.trim() || input.addressStreet.trim(),
      street: input.addressStreet.trim(),
      city: input.city.trim(),
      state: input.state.trim(),
      zip: input.zip.trim(),
      county: input.county.trim(),
      neighborhood: input.neighborhood.trim() || null,
      submarket: input.corridor.trim() || null,
      hideAddress: false,
    },
    location: {
      lat: parseOptionalNumber(input.latitude),
      lng: parseOptionalNumber(input.longitude),
    },
    property: {
      category: inferCategory(existing) || input.propertyTypeLabel.trim() || null,
      propertyTypeId: input.propertyTypeId.trim() || null,
      propertySubtypeId: input.propertySubtypeId.trim() || null,
      buildingSizeSf: parseOptionalNumber(input.buildingSizeSf),
      lotSizeAcres: parseOptionalNumber(input.lotSizeAcres),
      yearBuilt: parseOptionalNumber(input.yearBuilt),
      zoning: input.zoning.trim() || null,
      parcelId: input.parcelId.trim() || null,
      parking: input.parking.trim() || null,
      exteriorConstructionType: input.exteriorConstructionType.trim() || null,
      propertyClass: input.propertyClass.trim() || null,
    },
    pricing: {
      hideSalePrice: input.hideSalePrice || !input.salePriceDollars.trim(),
      hiddenPriceLabel: input.hiddenPriceLabel.trim() || null,
      salePriceDollars: parseOptionalNumber(input.salePriceDollars),
      askingPriceRatePerSf: parseOptionalNumber(input.askingPriceRate),
      availableSqFt: parseOptionalNumber(input.availableSf),
      listingPriceVisibility: input.listingPriceVisibility.trim() || null,
    },
    content: {
      saleTitle: input.saleTitle.trim() || null,
      saleDescription: input.saleDescription.trim() || null,
      leaseDescription: input.leaseDescription.trim() || null,
      locationDescription: input.locationDescription.trim() || null,
      exteriorDescription: input.exteriorDescription.trim() || null,
      saleBullets: splitBullets(input.saleBullets),
      leaseBullets: splitBullets(input.leaseBullets),
    },
    links: {
      websiteUrl: input.websiteUrl.trim() || null,
    },
    admin: {
      leadBroker: input.leadBroker.trim() || null,
      leaseType: input.leaseType.trim() || null,
      propertyTypeLabel: input.propertyTypeLabel.trim() || null,
      neighborhood: input.neighborhood.trim() || null,
      corridor: input.corridor.trim() || null,
      anchorTenants: splitLines(input.anchorTenants),
      nearbyRestaurants: splitLines(input.nearbyRestaurants),
      nearbyBanks: splitLines(input.nearbyBanks),
      assessorImprovements: splitLines(input.assessorImprovements),
    },
    meta: {
      updatedAt: FieldValue.serverTimestamp(),
      createdAt: existing ? undefined : FieldValue.serverTimestamp(),
      adminLastEditedAt: FieldValue.serverTimestamp(),
      intake: {
        lead_broker: input.leadBroker.trim() || null,
      },
      launchPackage: {
        status: existing ? "stale" : "not_built",
      },
      exportWorkflow: {
        status: "not_ready",
      },
      adminOverrides: {
        listingPriceVisibility: input.listingPriceVisibility.trim() || null,
        askingPriceRate: parseOptionalNumber(input.askingPriceRate),
        availableSf: parseOptionalNumber(input.availableSf),
        leaseType: input.leaseType.trim() || null,
        leadBroker: input.leadBroker.trim() || null,
        propertyTypeLabel: input.propertyTypeLabel.trim() || null,
        neighborhood: input.neighborhood.trim() || null,
        corridor: input.corridor.trim() || null,
        anchorTenants: splitLines(input.anchorTenants),
        nearbyRestaurants: splitLines(input.nearbyRestaurants),
        nearbyBanks: splitLines(input.nearbyBanks),
        parking: input.parking.trim() || null,
        exteriorConstructionType: input.exteriorConstructionType.trim() || null,
        propertyClass: input.propertyClass.trim() || null,
        assessorImprovements: splitLines(input.assessorImprovements),
      },
    },
  };

  const cleanPayload = JSON.parse(JSON.stringify(payload));
  await db.collection(PROPERTIES_COLLECTION).doc(docId).set(cleanPayload, { merge: true });

  const syncResult = await syncPropertyToAscendix(docId);

  return {
    ok: true,
    documentId: docId,
    slug,
    sync: syncResult,
  };
}
