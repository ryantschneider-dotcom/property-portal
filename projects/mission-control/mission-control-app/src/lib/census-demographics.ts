import { area, bbox, circle, featureCollection, intersect } from "@turf/turf";
import type { DemographicApiResponse } from "@/lib/offering-summary-pdf";

const ACS_YEAR = Number(process.env.CENSUS_ACS_YEAR || "2024");
const TIGER_LAYER_BLOCK_GROUPS = 10;
const TIGER_BASE_URL = `https://tigerweb.geo.census.gov/arcgis/rest/services/TIGERweb/tigerWMS_ACS${ACS_YEAR}/MapServer`;
const ACS_VARIABLES = [
  "B01003_001E", // population
  "B01002_001E", // median age, rendered as Average Age in PIER OM tables
  "B11001_001E", // households
  "B19013_001E", // median household income
] as const;

type BlockGroupFeature = GeoJSON.Feature<GeoJSON.Polygon | GeoJSON.MultiPolygon, {
  GEOID: string;
  STATE: string;
  COUNTY: string;
  TRACT: string;
  BLKGRP: string;
}>;

type ACSDatum = {
  geoid: string;
  population: number;
  medianAge: number;
  households: number;
  medianHouseholdIncome: number;
};

function requireCensusApiKey() {
  const key = process.env.CENSUS_API_KEY?.trim();
  if (!key) throw new Error("CENSUS_API_KEY is not configured");
  return key;
}

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url, { next: { revalidate: 60 * 60 * 12 } });
  if (!response.ok) throw new Error(`Request failed (${response.status}) for ${url}`);
  return response.json() as Promise<T>;
}

function numberValue(value: unknown) {
  const parsed = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

function formatInteger(value: number) {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(Math.round(Math.max(0, value)));
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(Math.round(Math.max(0, value)));
}

function formatAge(value: number) {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(Math.round(Math.max(0, value)));
}

function parseRadii(input?: number[]) {
  const radii = (input?.length ? input : [1, 3, 5]).map(Number).filter((value) => Number.isFinite(value) && value > 0);
  if (radii.length !== 3) throw new Error("Exactly three positive radii are required");
  if (!(radii[0] < radii[1] && radii[1] < radii[2])) throw new Error("Radii must be in strictly ascending order");
  return radii;
}

async function fetchBlockGroupsForPoint(lat: number, lng: number, maxRadiusMiles: number): Promise<BlockGroupFeature[]> {
  const searchCircle = circle([lng, lat], maxRadiusMiles + 0.2, { units: "miles", steps: 96 });
  const [minLng, minLat, maxLng, maxLat] = bbox(searchCircle);
  const params = new URLSearchParams({
    f: "geojson",
    where: "1=1",
    returnGeometry: "true",
    spatialRel: "esriSpatialRelIntersects",
    geometryType: "esriGeometryEnvelope",
    geometry: `${minLng},${minLat},${maxLng},${maxLat}`,
    inSR: "4326",
    outFields: "GEOID,STATE,COUNTY,TRACT,BLKGRP",
    outSR: "4326",
  });
  const url = `${TIGER_BASE_URL}/${TIGER_LAYER_BLOCK_GROUPS}/query?${params.toString()}`;
  const data = await fetchJson<GeoJSON.FeatureCollection<GeoJSON.Polygon | GeoJSON.MultiPolygon, Record<string, unknown>>>(url);
  return (data.features || []) as BlockGroupFeature[];
}

async function fetchACSDataForBlockGroups(features: BlockGroupFeature[]): Promise<Map<string, ACSDatum>> {
  const apiKey = requireCensusApiKey();
  const tractKeys = new Map<string, { state: string; county: string; tract: string }>();
  for (const feature of features) {
    const props = feature.properties;
    tractKeys.set(`${props.STATE}-${props.COUNTY}-${props.TRACT}`, { state: props.STATE, county: props.COUNTY, tract: props.TRACT });
  }

  const out = new Map<string, ACSDatum>();
  for (const tract of tractKeys.values()) {
    const params = new URLSearchParams({
      get: [...ACS_VARIABLES, "NAME"].join(","),
      for: "block group:*",
      in: `state:${tract.state} county:${tract.county} tract:${tract.tract}`,
      key: apiKey,
    });
    const rows = await fetchJson<string[][]>(`https://api.census.gov/data/${ACS_YEAR}/acs/acs5?${params.toString()}`);
    const [header, ...values] = rows;
    const index = Object.fromEntries(header.map((key, i) => [key, i]));
    for (const row of values) {
      const geoid = `${row[index.state]}${row[index.county]}${row[index.tract]}${row[index["block group"]]}`;
      out.set(geoid, {
        geoid,
        population: numberValue(row[index.B01003_001E]),
        medianAge: numberValue(row[index.B01002_001E]),
        households: numberValue(row[index.B11001_001E]),
        medianHouseholdIncome: numberValue(row[index.B19013_001E]),
      });
    }
  }
  return out;
}

function aggregateForRadius(lat: number, lng: number, radiusMiles: number, features: BlockGroupFeature[], acsMap: Map<string, ACSDatum>) {
  const radiusPolygon = circle([lng, lat], radiusMiles, { units: "miles", steps: 128 });
  let population = 0;
  let households = 0;
  let agePopulationWeight = 0;
  let weightedAge = 0;
  let incomeHouseholds = 0;
  let weightedIncome = 0;

  for (const feature of features) {
    const acs = acsMap.get(feature.properties.GEOID);
    if (!acs) continue;
    const overlap = intersect(featureCollection([feature as any, radiusPolygon as any]) as any);
    if (!overlap) continue;
    const featureArea = area(feature as any);
    const overlapArea = area(overlap as any);
    const ratio = featureArea && overlapArea ? Math.min(1, Math.max(0, overlapArea / featureArea)) : 0;
    if (!ratio) continue;

    population += acs.population * ratio;
    households += acs.households * ratio;
    if (acs.medianAge > 0 && acs.population > 0) {
      weightedAge += acs.medianAge * acs.population * ratio;
      agePopulationWeight += acs.population * ratio;
    }
    if (acs.medianHouseholdIncome > 0 && acs.households > 0) {
      weightedIncome += acs.medianHouseholdIncome * acs.households * ratio;
      incomeHouseholds += acs.households * ratio;
    }
  }

  return {
    radiusMiles,
    population,
    averageAge: agePopulationWeight ? weightedAge / agePopulationWeight : 0,
    households,
    medianHouseholdIncome: incomeHouseholds ? weightedIncome / incomeHouseholds : 0,
  };
}

export async function getRadiusDemographics(lat: number, lng: number, requestedRadii?: number[]): Promise<DemographicApiResponse> {
  const radii = parseRadii(requestedRadii);
  const features = await fetchBlockGroupsForPoint(lat, lng, Math.max(...radii));
  const acsMap = await fetchACSDataForBlockGroups(features);
  const computed = radii.map((radius) => aggregateForRadius(lat, lng, radius, features, acsMap));
  const row = (label: string, getter: (item: (typeof computed)[number]) => string) => ({
    label,
    values: computed.map((item) => ({ radiusMiles: item.radiusMiles, value: getter(item) })),
  });

  return {
    sourceYear: ACS_YEAR,
    radii,
    rows: [
      row("Population", (item) => formatInteger(item.population)),
      row("Average Age", (item) => formatAge(item.averageAge)),
      row("Households", (item) => formatInteger(item.households)),
      row("Median Household Income", (item) => formatCurrency(item.medianHouseholdIncome)),
    ],
  };
}
