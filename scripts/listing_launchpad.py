#!/usr/bin/env python3
"""PIER Listing Launchpad sheet integration.

Polls a public Google Sheet CSV for listing intake rows, sanitizes key fields,
geocodes the address, dual-writes sanitized listing data to ListingStream
(Firestore), routes rows to county-specific assessor handlers, and prepares
Buildout payloads that are explicitly draft-only.

Environment variables:
- BUILDOUT_API_BASE_URL: optional Buildout API base URL
- BUILDOUT_API_TOKEN: optional Buildout API bearer token
- LAUNCHPAD_POLL_INTERVAL_SECONDS: optional polling interval (default 300)
- LAUNCHPAD_STATE_FILE: optional override for state tracker path
- Maps_API_KEY: Google Maps Geocoding API key (loaded from scripts/.env if present)
- GOOGLE_APPLICATION_CREDENTIALS: path to Firestore service-account JSON
- OPENAI_API_KEY: enables AI-generated listing headlines/summaries via OpenAI-compatible API
- OPENAI_MODEL: optional model override (default: openai/gpt-5.4)
"""

from __future__ import annotations

import argparse
import csv
import io
import json
import os
import re
import time
import hashlib
import subprocess
import tempfile
from decimal import Decimal, InvalidOperation
from typing import Any, Dict, Iterable, List, Optional, Tuple
from urllib import error as urllib_error
from urllib import parse as urllib_parse
from urllib import request as urllib_request

try:
    from openai import OpenAI
except ImportError:  # pragma: no cover
    OpenAI = None

try:
    import googlemaps
except ImportError:  # pragma: no cover
    googlemaps = None

try:
    import firebase_admin
    from firebase_admin import credentials, firestore
except ImportError:  # pragma: no cover
    firebase_admin = None
    credentials = None
    firestore = None

try:
    from dotenv import load_dotenv
except ImportError:  # pragma: no cover
    load_dotenv = None

SPREADSHEET_ID = "17vwDuGMTbhKFmkA9aiox-dEynzi5QMtNlLPxRHLLjNg"
CSV_EXPORT_URL = (
    f"https://docs.google.com/spreadsheets/d/{SPREADSHEET_ID}/export?format=csv"
)
DEFAULT_POLL_INTERVAL_SECONDS = int(os.getenv("LAUNCHPAD_POLL_INTERVAL_SECONDS", "300"))
SCRIPT_DIR = os.path.dirname(__file__)
STATE_FILE = os.getenv(
    "LAUNCHPAD_STATE_FILE",
    os.path.join(SCRIPT_DIR, ".launchpad_state"),
)
DOTENV_PATH = os.path.join(SCRIPT_DIR, ".env")
FIRESTORE_COLLECTION = "listings"
BUILDOUT_PAYLOAD_DIR = os.path.join(SCRIPT_DIR, "buildout_payloads")

FIELD_MAP = {
    "transaction_type": "Transaction type",
    "street_number": "Street Number",
    "street_name": "Street Name",
    "city": "City",
    "county": "County",
    "state": "State",
    "zip_code": "Zip Code",
    "unit_number": "Unit #",
    "parcel_id": "Parcel ID",
    "tax_id": "Tax ID",
    "listing_price_visibility": "Listing Price Visibility",
    "listing_price_amount": "Listing Price Amount (Leave blank if undisclosed)",
    "website_url": "Website URL (If applicable)",
    "available_sf": "Available Sq. Ft.",
    "asking_price_rate": "Asking Price/Lease Rate/per sf",
    "lease_type": "Lease Type",
    "property_type": "Property Type",
    "timestamp": "Timestamp",
    "lead_broker": "Lead Broker",
}

BUILDOUT_PROPERTY_TYPE_MAP = {
    "office": 1,
    "retail": 2,
    "industrial": 3,
    "land": 5,
    "multifamily": 6,
    "special purpose": 7,
    "hospitality": 8,
}

BUILDOUT_PROPERTY_SUBTYPE_MAP = {
    "office": 101,
    "retail": 201,
    "industrial": 302,
    "land": 502,
    "multifamily": 603,
    "special purpose": 703,
    "hospitality": 803,
}

BUILDOUT_LEASE_TYPE_MAP = {
    "gross": 1,
    "modified gross": 2,
    "nnn": 3,
    "modified net": 4,
    "full service": 5,
    "ground lease": 6,
}

BUILDOUT_DEFAULT_BROKER_ID = 26315
BUILDOUT_DEFAULT_HIDDEN_PRICE_LABEL = "Please Call for Price"
QPUBLIC_COUNTY_APPS = {
    "chatham": "ChathamCountyGA",
    "bryan": "BryanCountyGA",
    "effingham": "EffinghamCountyGA",
    "liberty": "LibertyCountyGA",
    "bulloch": "BullochCountyGA",
    "camden": "CamdenCountyGA",
    "glynn": "GlynnCountyGA",
    "mcintosh": "McIntoshCountyGA",
    "mc intosh": "McIntoshCountyGA",
}

BUILDOUT_PROPERTY_SUBTYPE_ENUMS = {
    101: "Office Building",
    102: "Creative/Loft",
    103: "Executive Suites",
    104: "Medical",
    105: "Institutional/Governmental",
    106: "Office Warehouse",
    107: "Office Condo",
    108: "Coworking",
    109: "Lab",
    201: "Street Retail",
    202: "Strip Center",
    203: "Free Standing Building",
    204: "Regional Mall",
    205: "Retail Pad",
    206: "Vehicle Related",
    207: "Outlet Center",
    208: "Power Center",
    209: "Neighborhood Center",
    210: "Community Center",
    211: "Specialty Center",
    212: "Theme/Festival Center",
    213: "Restaurant",
    214: "Post Office",
    215: "Retail Condo",
    216: "Lifestyle Center",
    301: "Manufacturing",
    302: "Warehouse/Distribution",
    303: "Flex Space",
    304: "Research & Development",
    305: "Refrigerated/Cold Storage",
    306: "Office Showroom",
    307: "Truck Terminal/Hub/Transit",
    308: "Self Storage",
    309: "Industrial Condo",
    310: "Data Center",
    501: "Office",
    502: "Retail",
    503: "Retail-Pad",
    504: "Industrial",
    505: "Residential",
    506: "Multifamily",
    507: "Other",
    601: "High-Rise",
    602: "Mid-Rise",
    603: "Low-Rise/Garden",
    604: "Government Subsidized",
    605: "Mobile Home Park",
    606: "Senior Living",
    607: "Skilled Nursing",
    608: "Single Family Rental Portfolio",
    701: "School",
    702: "Marina",
    703: "Other",
    704: "Golf Course",
    705: "Church",
    801: "Full Service",
    802: "Limited Service",
    803: "Select Service",
    804: "Resort",
    805: "Economy",
    806: "Extended Stay",
    807: "Casino",
}

BUILDOUT_ALLOWED_SUBTYPES_BY_PROPERTY_TYPE = {
    "office": {101, 102, 103, 104, 105, 106, 107, 108, 109},
    "retail": {201, 202, 203, 204, 205, 206, 207, 208, 209, 210, 211, 212, 213, 214, 215, 216},
    "industrial": {301, 302, 303, 304, 305, 306, 307, 308, 309, 310},
    "land": {501, 502, 503, 504, 505, 506, 507},
    "multifamily": {601, 602, 603, 604, 605, 606, 607, 608},
    "special purpose": {701, 702, 703, 704, 705},
    "hospitality": {801, 802, 803, 804, 805, 806, 807},
}

_CURRENCY_CLEAN_RE = re.compile(r"[^0-9.\-]")


def bootstrap_env() -> None:
    if load_dotenv and os.path.exists(DOTENV_PATH):
        load_dotenv(DOTENV_PATH)


def fetch_sheet_rows() -> List[Dict[str, str]]:
    req = urllib_request.Request(
        CSV_EXPORT_URL,
        headers={"User-Agent": "Mozilla/5.0"},
        method="GET",
    )
    with urllib_request.urlopen(req, timeout=30) as response:
        csv_text = response.read().decode("utf-8-sig")

    reader = csv.DictReader(io.StringIO(csv_text))
    rows: List[Dict[str, str]] = []
    for row in reader:
        normalized = {str(k).strip(): (v if v is not None else "") for k, v in row.items()}
        if any(str(v).strip() for v in normalized.values()):
            rows.append(normalized)
    return rows


def title_case(value: Any) -> str:
    text = str(value or "").strip()
    if not text:
        return ""
    return re.sub(r"\s+", " ", text).title()


def format_currency(value: Any) -> str:
    text = str(value or "").strip()
    if not text:
        return ""

    cleaned = _CURRENCY_CLEAN_RE.sub("", text)
    if not cleaned or cleaned in {"-", ".", "-."}:
        return text

    try:
        amount = Decimal(cleaned)
    except InvalidOperation:
        return text

    if amount == amount.to_integral():
        return f"${int(amount):,}"
    return f"${amount:,.2f}"


def format_number_with_commas(value: Any) -> str:
    text = str(value or "").strip()
    if not text:
        return ""

    cleaned = text.replace(",", "")
    try:
        amount = Decimal(cleaned)
    except InvalidOperation:
        return text

    if amount == amount.to_integral():
        return f"{int(amount):,}"
    return f"{amount:,.2f}"


def extract_mapped_fields(row: Dict[str, Any]) -> Dict[str, Any]:
    extracted = dict(row)
    for alias, header in FIELD_MAP.items():
        extracted[alias] = str(row.get(header, "") or "").strip()

    # Backward-compatible aliases for live sheet variations.
    parcel_aliases = [
        extracted.get("parcel_id", ""),
        extracted.get("tax_id", ""),
        str(row.get("County Tax Parcel ID#", "") or "").strip(),
        str(row.get("Tax ID #/Map ID #", "") or "").strip(),
    ]
    parcel_value = next((value for value in parcel_aliases if value), "")
    if parcel_value:
        extracted["parcel_id"] = parcel_value
        extracted["tax_id"] = parcel_value
    return extracted


def sanitize_sheet_row(row: Dict[str, Any]) -> Dict[str, Any]:
    sanitized = extract_mapped_fields(row)

    sanitized["street_name"] = title_case(sanitized.get("street_name"))
    sanitized["city"] = title_case(sanitized.get("city"))
    sanitized["available_sf"] = format_number_with_commas(sanitized.get("available_sf"))

    asking_price_rate = sanitized.get("asking_price_rate", "")
    if asking_price_rate:
        sanitized["asking_price_rate"] = format_currency(asking_price_rate)

    visibility = str(sanitized.get("listing_price_visibility", "")).strip().lower()
    if visibility == "undisclosed":
        sanitized["listing_price_visibility"] = "Undisclosed"
        sanitized["listing_price_amount"] = ""
    elif visibility == "disclosed":
        sanitized["listing_price_visibility"] = "Disclosed"
        sanitized["listing_price_amount"] = format_currency(sanitized.get("listing_price_amount"))
    else:
        sanitized["listing_price_visibility"] = title_case(sanitized.get("listing_price_visibility"))

    sanitized["transaction_type"] = title_case(sanitized.get("transaction_type"))
    sanitized["county"] = title_case(sanitized.get("county"))
    sanitized["property_type"] = title_case(sanitized.get("property_type"))
    sanitized["lead_broker"] = title_case(sanitized.get("lead_broker"))
    sanitized["state"] = str(sanitized.get("state", "")).strip().upper()
    sanitized["zip_code"] = str(sanitized.get("zip_code", "")).strip()
    sanitized["street_number"] = str(sanitized.get("street_number", "")).strip()
    sanitized["timestamp"] = str(sanitized.get("timestamp", "")).strip()
    sanitized["website_url"] = str(sanitized.get("website_url", "")).strip()

    return sanitized


def init_maps_client():
    api_key = os.getenv("Maps_API_KEY", "").strip()
    if not api_key or googlemaps is None:
        return None
    return googlemaps.Client(key=api_key)


def geocode_address(row: Dict[str, Any]) -> Dict[str, Any]:
    client = init_maps_client()
    address = build_property_address(row)
    api_key = os.getenv("Maps_API_KEY", "").strip()

    if not address:
        return {"status": "skipped", "reason": "missing address", "map_coordinates": None}

    if client is not None:
        try:
            results = client.geocode(address)
            if not results:
                return {"status": "not_found", "map_coordinates": None, "address": address}
            location = results[0].get("geometry", {}).get("location", {})
            coords = {"lat": float(location["lat"]), "lng": float(location["lng"])}
            return {"status": "ok", "map_coordinates": coords, "address": address}
        except Exception as exc:  # pragma: no cover
            return {"status": "error", "error": str(exc), "address": address, "map_coordinates": None}

    if not api_key:
        return {"status": "skipped", "reason": "Maps_API_KEY missing", "map_coordinates": None}

    try:
        query = urllib_parse.urlencode({"address": address, "key": api_key})
        url = f"https://maps.googleapis.com/maps/api/geocode/json?{query}"
        with urllib_request.urlopen(url, timeout=30) as response:
            payload = json.loads(response.read().decode("utf-8"))
        results = payload.get("results", [])
        if not results:
            return {"status": "not_found", "map_coordinates": None, "address": address}
        location = (results[0].get("geometry") or {}).get("location") or {}
        if "lat" not in location or "lng" not in location:
            return {"status": "not_found", "map_coordinates": None, "address": address}
        coords = {"lat": float(location["lat"]), "lng": float(location["lng"])}
        return {"status": "ok", "map_coordinates": coords, "address": address}
    except Exception as exc:
        return {"status": "error", "error": str(exc), "address": address, "map_coordinates": None}


def init_firestore():
    if firebase_admin is None or credentials is None or firestore is None:
        return None

    try:
        app = firebase_admin.get_app()
    except ValueError:
        cred_path = os.getenv("GOOGLE_APPLICATION_CREDENTIALS", "").strip()
        if not cred_path:
            return None
        app = firebase_admin.initialize_app(credentials.Certificate(cred_path))
    return firestore.client(app)


def build_listingstream_document_id(row: Dict[str, Any]) -> str:
    basis = "|".join(
        [
            "launchpad",
            str(row.get("street_number", "")).strip().lower(),
            str(row.get("street_name", "")).strip().lower(),
            str(row.get("city", "")).strip().lower(),
            str(row.get("state", "")).strip().lower(),
            str(row.get("zip_code", "")).strip().lower(),
            str(row.get("unit_number", "")).strip().lower(),
            str(row.get("transaction_type", "")).strip().lower(),
        ]
    )
    return hashlib.sha1(basis.encode("utf-8")).hexdigest()


def write_to_listingstream(
    row: Dict[str, Any],
    map_coordinates: Optional[Dict[str, float]],
    ai_copy: Optional[Dict[str, str]] = None,
) -> Dict[str, Any]:
    db = init_firestore()
    if db is None or firestore is None:
        return {"status": "skipped", "reason": "firebase-admin unavailable or credentials missing"}

    payload = dict(row)
    payload["map_coordinates"] = map_coordinates
    payload["copy"] = ai_copy or {}
    payload["source"] = "Launchpad"
    payload["status"] = "Active"
    payload["updated_at"] = firestore.SERVER_TIMESTAMP

    doc_id = build_listingstream_document_id(row)

    try:
        doc_ref = db.collection(FIRESTORE_COLLECTION).document(doc_id)
        existing = doc_ref.get()
        if existing.exists:
            payload["created_at"] = existing.to_dict().get("created_at", firestore.SERVER_TIMESTAMP)
            doc_ref.set(payload, merge=True)
            write_status = "updated"
        else:
            payload["created_at"] = firestore.SERVER_TIMESTAMP
            doc_ref.set(payload, merge=True)
            write_status = "created"
        return {
            "status": "ok",
            "write_status": write_status,
            "collection": FIRESTORE_COLLECTION,
            "document_id": doc_ref.id,
            "payload": payload,
        }
    except Exception as exc:  # pragma: no cover
        return {"status": "error", "error": str(exc), "payload": payload, "document_id": doc_id}


def run_qpublic_scraper(address: str, county: str, parcel_id: Optional[str] = None) -> Dict[str, Any]:
    county_key = str(county or "").strip().lower()
    app_name = QPUBLIC_COUNTY_APPS.get(county_key)
    if not app_name:
        return {
            "status": "unsupported",
            "source": "qpublic-playwright",
            "county": county,
            "address": address,
            "reason": "county not mapped to qPublic app",
        }

    node_workdir = "/tmp/pwprobe"
    os.makedirs(node_workdir, exist_ok=True)
    script_path = os.path.join(node_workdir, "qpublic_county_extract.js")
    script = r'''
const { chromium } = require('playwright');
(async() => {
  const countyApp = process.argv[2];
  const parcelId = process.argv[3] === '__NONE__' ? '' : (process.argv[3] || '');
  const address = process.argv.slice(4).join(' ');
  const browser = await chromium.launch({headless:true, executablePath:'/usr/bin/chromium', args:['--disable-blink-features=AutomationControlled','--no-sandbox']});
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
  });
  const page = await context.newPage();
  try {
    await page.goto(`https://qpublic.schneidercorp.com/Application.aspx?App=${countyApp}&PageType=Search`, {waitUntil:'domcontentloaded', timeout:60000});
    await page.waitForTimeout(5000);
    const agree = page.locator('text=Agree');
    if (await agree.count()) {
      await agree.first().click();
      await page.waitForTimeout(1500);
    }
    const normalizeParcelIdVariants = (rawParcelId) => {
      const base = String(rawParcelId || '').toUpperCase().replace(/\s+/g, ' ').trim();
      if (!base) return [];
      const compact = base.replace(/[^A-Z0-9]/g, '');
      const spacedNumeric = compact.replace(/(\d{5})(\d{5,})/, '$1 $2');
      return Array.from(new Set([base, compact, spacedNumeric].filter(Boolean)));
    };

    const normalizeSearchAddressVariants = (rawAddress) => {
      const normalize = (value) => String(value || '').toUpperCase().replace(/\s+/g, ' ').trim();
      const stripTrailingLocality = (value) => value
        .replace(/,.*$/, '')
        .replace(/\bSAVANNAH\b.*$/, '')
        .replace(/\bRICHMOND HILL\b.*$/, '')
        .replace(/\bPOOLER\b.*$/, '')
        .replace(/\bGA\b.*$/, '')
        .replace(/\b\d{5}(?:-\d{4})?\b.*$/, '')
        .replace(/\s+/g, ' ')
        .trim();
      const suffixMap = {
        DRIVE: 'DR',
        STREET: 'ST',
        AVENUE: 'AVE',
        ROAD: 'RD',
        BOULEVARD: 'BLVD',
        LANE: 'LN',
        COURT: 'CT',
        CIRCLE: 'CIR',
        HIGHWAY: 'HWY',
        PARKWAY: 'PKWY',
        TERRACE: 'TER',
        PLACE: 'PL',
      };

      const base = stripTrailingLocality(normalize(rawAddress));
      const standardized = Object.entries(suffixMap).reduce((acc, [full, abbr]) => {
        return acc.replace(new RegExp(`\\b${full}\\b`, 'g'), abbr);
      }, base);
      const minimal = standardized.replace(/\b(DR|ST|AVE|RD|BLVD|LN|CT|CIR|HWY|PKWY|TER|PL)\b$/, '').replace(/\s+/g, ' ').trim();

      return Array.from(new Set([base, standardized, minimal].filter(Boolean)));
    };

    const searchAddressVariants = normalizeSearchAddressVariants(address);
    const parcelIdVariants = normalizeParcelIdVariants(parcelId);
    let searchVariantUsed = null;
    let searchModeUsed = null;

    const normalize = (value) => String(value || '').replace(/\s+/g, ' ').trim();
    const compactAddress = (value) => normalize(value).toLowerCase().replace(/[^a-z0-9]/g, '');
    const targetAddressCompact = compactAddress(address);
    const parseNumber = (value) => {
      if (value == null) return null;
      const match = String(value).replace(/,/g,'').match(/-?\d+(?:\.\d+)?/);
      return match ? Number(match[0]) : null;
    };
    const parseIntNumber = (value) => {
      const num = parseNumber(value);
      return num == null ? null : Math.round(num);
    };

    const scrapeRows = async () => {
      return await page.locator('tr').evaluateAll(rows => rows
        .map(tr => Array.from(tr.querySelectorAll('th,td'))
          .map(td => (td.textContent || '').replace(/\s+/g,' ').trim())
          .filter(Boolean))
        .filter(r => r.length));
    };

    const isReportPage = async () => {
      const title = await page.title();
      const url = page.url();
      if (/pagetypeid=4|\/report/i.test(url) || /report/i.test(title)) return true;
      const parcelLabel = page.locator('text=Parcel Number');
      const locationLabel = page.locator('text=Location Address');
      return (await parcelLabel.count()) > 0 || (await locationLabel.count()) > 0;
    };

    const isResultsPage = async () => {
      const title = await page.title();
      const url = page.url();
      if (/pagetypeid=1|\/results/i.test(url) || /results/i.test(title)) return true;
      const searchResults = page.locator('text=Search Results');
      return (await searchResults.count()) > 0;
    };

    const isNoDataResultsPage = async () => {
      return await page.locator('.nodata-content').count() > 0;
    };

    const isLoginPage = async () => {
      const title = await page.title();
      const url = page.url();
      if (/\/account\/login/i.test(url) || /login/i.test(title)) return true;
      const loginText = page.locator('text=Login');
      return (await loginText.count()) > 0;
    };

    const performSearchAttempt = async (candidate, mode) => {
      await page.goto(`https://qpublic.schneidercorp.com/Application.aspx?App=${countyApp}&PageType=Search`, {waitUntil:'domcontentloaded', timeout:60000});
      await page.waitForTimeout(1500);
      const agreeRetry = page.locator('text=Agree');
      if (await agreeRetry.count()) {
        await agreeRetry.first().click();
        await page.waitForTimeout(1000);
      }

      const addressBox = page.locator('#ctlBodyPane_ctl02_ctl01_txtAddress');
      const parcelBox = page.locator('#ctlBodyPane_ctl00_ctl01_txtParcelID');
      const addressButton = page.locator('#ctlBodyPane_ctl02_ctl01_btnSearch');
      const parcelButton = page.locator('#ctlBodyPane_ctl00_ctl01_btnSearch');

      if (mode === 'parcel' && await parcelBox.count()) {
        await parcelBox.fill('');
        await parcelBox.fill(candidate);
        await parcelBox.press('Enter').catch(() => {});
        await page.waitForTimeout(500);
        if (/PageType=Search/i.test(page.url())) {
          await page.evaluate(() => {
            if (typeof __doPostBack === 'function') {
              __doPostBack('ctlBodyPane$ctl00$ctl01$btnSearch', '');
            }
          }).catch(() => {});
        }
      } else {
        await addressBox.fill('');
        await addressBox.fill(candidate);
        await addressButton.click({ force: true });
      }

      await page.waitForLoadState('domcontentloaded', { timeout: 60000 }).catch(() => {});
      await page.waitForTimeout(3500);
      searchVariantUsed = candidate;
      searchModeUsed = mode;
      return !(await isNoDataResultsPage()) && !(/PageType=Search/i.test(page.url()) && /search/i.test(await page.title()));
    };

    let transitioned = false;
    for (const candidate of parcelIdVariants) {
      if (await performSearchAttempt(candidate, 'parcel')) {
        transitioned = true;
        break;
      }
    }
    if (!transitioned) {
      for (const candidate of searchAddressVariants) {
        if (await performSearchAttempt(candidate, 'address')) {
          transitioned = true;
          break;
        }
      }
    }

    const scavengeResultsPageData = async (status = 'login_gated') => {
      const rows = await scrapeRows();
      const allText = rows.map(r => r.join(' | '));
      const sfLine = allText.find(line => /sq\s*ft|sqft|square\s*feet|building\s*size|total\s*sq/i.test(line)) || '';
      const yearLine = allText.find(line => /year\s*built|built/i.test(line)) || '';
      const typeLine = allText.find(line => /property\s*class|building\s*type|improvement\s*type|class/i.test(line)) || '';
      const parcelLine = allText.find(line => /parcel|pin|parcel number/i.test(line)) || '';

      return {
        assessor_status: status,
        source: 'qpublic-playwright',
        county: countyApp,
        address,
        parcel_number: parcelLine || null,
        location_address: null,
        property_class: typeLine || null,
        zoning: null,
        lot_size_acres: null,
        year_built: parseIntNumber(yearLine),
        building_size_sf: parseIntNumber(sfLine),
        lot_size_sf: null,
        exterior_construction_type: typeLine || null,
        parking: null,
        assessor_improvements: [],
        fallback_mode: 'results_page_scavenge',
        notes: [
          `URL: ${page.url()}`,
          `Title: ${await page.title()}`,
          sfLine ? `Scavenged SF row: ${sfLine}` : 'Scavenged SF row: none',
          yearLine ? `Scavenged Year row: ${yearLine}` : 'Scavenged Year row: none',
          typeLine ? `Scavenged Type row: ${typeLine}` : 'Scavenged Type row: none',
        ],
        raw_results_excerpt: allText.slice(0, 12),
      };
    };

    const clickBestResultFromResultsPage = async () => {
      const rowLocator = page.locator('tr');
      const rowCount = await rowLocator.count();
      const candidates = [];

      for (let rowIndex = 0; rowIndex < rowCount; rowIndex++) {
        const row = rowLocator.nth(rowIndex);
        const rowText = normalize(await row.textContent().catch(() => ''));
        if (!rowText) continue;
        if (/search results|disclaimer|log in|register|menu|sales search|advanced search/i.test(rowText)) continue;

        const reportAnchors = row.locator('a[href*="PageTypeID=4"][href*="KeyValue="]');
        const reportCount = await reportAnchors.count();
        for (let anchorIndex = 0; anchorIndex < reportCount; anchorIndex++) {
          const anchor = reportAnchors.nth(anchorIndex);
          const href = (await anchor.getAttribute('href').catch(() => '')) || '';
          if (!href) continue;
          const haystackCompact = compactAddress(rowText);
          let score = 0;
          if (targetAddressCompact && haystackCompact.includes(targetAddressCompact)) score += 1000;
          if (/abercorn|parcel|owner|legal description|location/i.test(rowText)) score += 100;
          if (/PageTypeID=4/.test(href) && /KeyValue=/.test(href)) score += 500;
          candidates.push({ rowIndex, anchorIndex, href, rowText, score });
        }
      }

      candidates.sort((a, b) => b.score - a.score);
      if (!candidates.length) {
        throw new Error('Results page detected but no matching parcel report link was found');
      }

      const best = candidates[0];
      const link = rowLocator.nth(best.rowIndex).locator('a[href*="PageTypeID=4"][href*="KeyValue="]').nth(best.anchorIndex);
      await link.scrollIntoViewIfNeeded().catch(() => {});
      await link.click({ timeout: 30000, force: true });
      await page.waitForLoadState('domcontentloaded', { timeout: 60000 }).catch(() => {});
      await page.waitForTimeout(3500);
      return best;
    };

    let navigation = { initialUrl: page.url(), pageType: 'unknown', clickedResult: null };
    let loginGated = false;

    const onSearchPage = /PageType=Search/i.test(page.url()) || /search/i.test(await page.title());
    if (onSearchPage) {
      throw new Error(`Search did not transition to results for any variant. Parcel variants: ${parcelIdVariants.join(' | ')} | Address variants: ${searchAddressVariants.join(' | ')}`);
    }

    if (await isNoDataResultsPage()) {
      const fallback = await scavengeResultsPageData('no_results');
      fallback.navigation = {
        ...navigation,
        pageType: 'results',
        finalUrl: page.url(),
        finalTitle: await page.title(),
        noData: true,
        searchVariantUsed,
        searchModeUsed,
        searchVariantsTried: searchAddressVariants,
        parcelIdVariantsTried: parcelIdVariants,
      };
      console.log(JSON.stringify(fallback));
      return;
    }

    if (await isResultsPage() && !(await isReportPage())) {
      navigation.pageType = 'results';
      navigation.clickedResult = await clickBestResultFromResultsPage();
      if (await isLoginPage()) {
        loginGated = true;
      }
    }

    if (loginGated) {
      const returnUrl = (() => {
        try {
          const url = new URL(page.url());
          return url.searchParams.get('ReturnUrl');
        } catch {
          return null;
        }
      })();
      if (returnUrl) {
        const reportUrl = new URL(returnUrl, page.url()).toString();
        await page.goto(reportUrl, { waitUntil: 'domcontentloaded', timeout: 60000 }).catch(() => {});
        await page.waitForTimeout(3000);
      }
    }

    if (loginGated && !(await isReportPage())) {
      const fallback = await scavengeResultsPageData();
      fallback.navigation = {
        ...navigation,
        finalUrl: page.url(),
        finalTitle: await page.title(),
        loginGated: true,
      };
      console.log(JSON.stringify(fallback));
      return;
    }

    if (!(await isReportPage())) {
      throw new Error(`Did not reach final report page. Current URL: ${page.url()} | Title: ${await page.title()}`);
    }

    navigation.finalUrl = page.url();
    navigation.finalTitle = await page.title();
    navigation.loginGated = loginGated;
    navigation.searchVariantUsed = searchVariantUsed;
    navigation.searchModeUsed = searchModeUsed;
    navigation.searchVariantsTried = searchAddressVariants;
    navigation.parcelIdVariantsTried = parcelIdVariants;

    const rows = await scrapeRows();
    const pairMap = {};
    for (const cells of rows) {
      if (cells.length === 2) pairMap[cells[0]] = cells[1];
      if (cells.length > 2) {
        for (let i = 0; i < cells.length - 1; i += 1) {
          const key = cells[i];
          const value = cells[i + 1];
          if (!pairMap[key] && key && value) pairMap[key] = value;
        }
      }
    }

    const allText = rows.map(r => r.join(' | '));
    const bodyText = (await page.evaluate(() => (document.body?.innerText || '').replace(/\s+/g, ' ').trim())) || '';
    const findRowContaining = (...needles) => rows.find(r => {
      const joined = r.join(' ').toLowerCase();
      return needles.some(needle => joined.includes(String(needle).toLowerCase()));
    });
    const findLineContaining = (...needles) => allText.find(line => needles.some(needle => line.toLowerCase().includes(String(needle).toLowerCase()))) || '';
    const extractPairValue = (...labels) => {
      for (const label of labels) {
        if (pairMap[label]) return pairMap[label];
        const row = rows.find(cells => cells.some(cell => normalize(cell).toLowerCase() === normalize(label).toLowerCase()));
        if (row) {
          const idx = row.findIndex(cell => normalize(cell).toLowerCase() === normalize(label).toLowerCase());
          if (idx >= 0 && row[idx + 1]) return row[idx + 1];
        }
      }
      return null;
    };
    const parcelFromUrl = (() => {
      const match = (navigation.finalUrl || '').match(/[?&]KeyValue=([^&]+)/i);
      return match ? decodeURIComponent(match[1]).replace(/\+/g, ' ').trim() : null;
    })();
    const parcelFromTitle = (() => {
      const match = (navigation.finalTitle || '').match(/Report:\s*([A-Z0-9\- ]+)/i);
      return match ? match[1].trim() : null;
    })();
    const zoningLine = findLineContaining('zoning', 'zone');
    const zoningFromLine = (() => {
      const explicit = zoningLine.match(/zoning[^A-Z0-9]*([A-Z]{1,6}(?:-[A-Z0-9]{1,6})?)/i);
      if (explicit) return explicit[1].toUpperCase();
      const trailing = zoningLine.match(/\b([A-Z]{1,6}(?:-[A-Z0-9]{1,6})?)\b$/);
      return trailing ? trailing[1].toUpperCase() : null;
    })();
    const zoningFromBody = (() => {
      const patterns = [
        /(?:zoning|zone)\s*(?:classification)?\s*[:\-]?\s*([A-Z]{1,6}(?:-[A-Z0-9]{1,6})?)/i,
        /(?:zoning|zone)\s+([A-Z]{1,6}(?:-[A-Z0-9]{1,6})?)/i,
      ];
      for (const pattern of patterns) {
        const match = bodyText.match(pattern);
        if (match) return match[1].toUpperCase();
      }
      return null;
    })();

    const landRow = findRowContaining('GENERAL COMMERCIAL', 'land use', 'land') || [];
    const buildingRow = findRowContaining('Neighborhood Shopping Ctr', 'total sq footage', 'year built') || [];
    const accessoryRows = rows.filter(r => r.join(' ').includes('PAVING') || r.join(' ').includes('CANOPY'));
    const lotSizeSf = extractPairValue('Square Feet', 'Land Square Feet') ? parseIntNumber(extractPairValue('Square Feet', 'Land Square Feet')) : (landRow.length >= 4 ? parseIntNumber(landRow[3]) : null);
    const lotSizeAcresRaw = extractPairValue('Acres', 'Land Acres');
    const lotSizeAcresFromBody = (() => {
      const patterns = [
        /(?:land\s+)?acres\s*[:\-]?\s*([0-9]+(?:\.[0-9]+)?)/i,
        /([0-9]+(?:\.[0-9]+)?)\s+acres?/i,
      ];
      for (const pattern of patterns) {
        const match = bodyText.match(pattern);
        if (match) return parseNumber(match[1]);
      }
      return null;
    })();
    const lotSizeAcres = parseNumber(lotSizeAcresRaw) || lotSizeAcresFromBody || (lotSizeSf ? Number((lotSizeSf / 43560).toFixed(2)) : null);

    const result = {
      status: 'ok',
      assessor_status: 'ok',
      source: 'qpublic-playwright',
      county: countyApp,
      address,
      parcel_number: extractPairValue('Parcel Number', 'Parcel', 'Map/Parcel') || parcelFromUrl || parcelFromTitle || null,
      location_address: extractPairValue('Location Address', 'Property Address') || null,
      property_class: extractPairValue('Property Class') || null,
      zoning: extractPairValue('Zoning', 'Zone') || zoningFromLine || zoningFromBody || null,
      lot_size_acres: lotSizeAcres,
      year_built: parseIntNumber(extractPairValue('Year Built')) || parseIntNumber(findLineContaining('year built')),
      building_size_sf: parseIntNumber(extractPairValue('Total Sq Footage', 'Building Size')) || parseIntNumber(findLineContaining('total sq footage', 'building size')),
      lot_size_sf: lotSizeSf,
      exterior_construction_type: buildingRow.length >= 8 ? `${buildingRow[6]} ${buildingRow[7]}` : null,
      parking: accessoryRows.map(r => r[0]).filter(Boolean).join('; ') || null,
      assessor_improvements: accessoryRows.map(r => r[0]).filter(Boolean),
      navigation,
      notes: [
        `URL: ${page.url()}`,
        `Title: ${await page.title()}`,
        zoningLine ? `Zoning line: ${zoningLine}` : 'Zoning line: none',
        zoningFromBody ? `Zoning body match: ${zoningFromBody}` : 'Zoning body match: none',
        lotSizeAcresFromBody ? `Acres body match: ${lotSizeAcresFromBody}` : 'Acres body match: none',
      ],
    };
    console.log(JSON.stringify(result));
  } catch (err) {
    console.log(JSON.stringify({status:'error', source:'qpublic-playwright', county:countyApp, address, error:String(err)}));
  } finally {
    await browser.close();
  }
})();
'''
    with open(script_path, "w", encoding="utf-8") as handle:
        handle.write(script)

    try:
        if not os.path.exists(os.path.join(node_workdir, "node_modules", "playwright")):
            subprocess.run(
                ["npm", "init", "-y"],
                cwd=node_workdir,
                check=True,
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
            )
            subprocess.run(
                ["npm", "install", "playwright"],
                cwd=node_workdir,
                check=True,
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
            )

        completed = subprocess.run(
            ["node", script_path, app_name, (parcel_id or "__NONE__"), address],
            cwd=node_workdir,
            check=True,
            capture_output=True,
            text=True,
            timeout=120,
        )
        output = (completed.stdout or "").strip().splitlines()[-1]
        return json.loads(output)
    except Exception as exc:
        return {
            "status": "error",
            "source": "qpublic-playwright",
            "county": county,
            "address": address,
            "error": str(exc),
        }


def chatham_assessor(address: str, row: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    parcel_id = str((row or {}).get("parcel_id") or (row or {}).get("tax_id") or "").strip()
    return run_qpublic_scraper(address, "chatham", parcel_id=parcel_id)


def bryan_assessor(address: str, row: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    parcel_id = str((row or {}).get("parcel_id") or (row or {}).get("tax_id") or "").strip()
    return run_qpublic_scraper(address, "bryan", parcel_id=parcel_id)


def beaufort_assessor(address: str, row: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    return {"county": "Beaufort", "address": address, "status": "placeholder", "reason": "non-qPublic county"}


def jasper_assessor(address: str, row: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    return {"county": "Jasper", "address": address, "status": "placeholder", "reason": "non-qPublic county"}


def effingham_assessor(address: str, row: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    parcel_id = str((row or {}).get("parcel_id") or (row or {}).get("tax_id") or "").strip()
    return run_qpublic_scraper(address, "effingham", parcel_id=parcel_id)


def liberty_assessor(address: str, row: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    parcel_id = str((row or {}).get("parcel_id") or (row or {}).get("tax_id") or "").strip()
    return run_qpublic_scraper(address, "liberty", parcel_id=parcel_id)


def bulloch_assessor(address: str, row: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    parcel_id = str((row or {}).get("parcel_id") or (row or {}).get("tax_id") or "").strip()
    return run_qpublic_scraper(address, "bulloch", parcel_id=parcel_id)


def camden_assessor(address: str, row: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    parcel_id = str((row or {}).get("parcel_id") or (row or {}).get("tax_id") or "").strip()
    return run_qpublic_scraper(address, "camden", parcel_id=parcel_id)


def glynn_assessor(address: str, row: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    parcel_id = str((row or {}).get("parcel_id") or (row or {}).get("tax_id") or "").strip()
    return run_qpublic_scraper(address, "glynn", parcel_id=parcel_id)


def mcintosh_assessor(address: str, row: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    parcel_id = str((row or {}).get("parcel_id") or (row or {}).get("tax_id") or "").strip()
    return run_qpublic_scraper(address, "mcintosh", parcel_id=parcel_id)


def route_to_assessor(county: str, address: str, row: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    county_key = (county or "").strip().lower()

    if county_key == "chatham":
        return chatham_assessor(address, row)
    elif county_key == "bryan":
        return bryan_assessor(address, row)
    elif county_key == "beaufort":
        return beaufort_assessor(address, row)
    elif county_key == "jasper":
        return jasper_assessor(address, row)
    elif county_key == "effingham":
        return effingham_assessor(address, row)
    elif county_key == "liberty":
        return liberty_assessor(address, row)
    elif county_key == "bulloch":
        return bulloch_assessor(address, row)
    elif county_key == "camden":
        return camden_assessor(address, row)
    elif county_key == "glynn":
        return glynn_assessor(address, row)
    elif county_key in {"mcintosh", "mc intosh"}:
        return mcintosh_assessor(address, row)
    else:
        raise ValueError(f"Unsupported county routing for '{county}'")


def build_property_address(row: Dict[str, Any]) -> str:
    street_number = str(row.get("street_number", "") or "").strip()
    street_name = str(row.get("street_name", "") or "").strip()
    city = str(row.get("city", "") or "").strip()
    state = str(row.get("state", "") or "").strip()
    zip_code = str(row.get("zip_code", "") or "").strip()

    street_line = " ".join(part for part in [street_number, street_name] if part).strip()
    street_line_upper = street_line.upper()
    city_upper = city.upper()
    state_upper = state.upper()
    zip_upper = zip_code.upper()

    if street_name:
        existing_upper = street_name.upper()
        if city_upper and city_upper in existing_upper:
            street_line = street_name
        elif state_upper and state_upper in existing_upper:
            street_line = street_name
        elif zip_upper and zip_upper in existing_upper:
            street_line = street_name

    parts = [street_line, city, state, zip_code]
    return " ".join(str(part).strip() for part in parts if str(part).strip())


def google_places_text_search(query: str, limit: int = 8) -> List[str]:
    api_key = os.getenv("Maps_API_KEY", "").strip()
    if not api_key:
        return []

    url = "https://places.googleapis.com/v1/places:searchText"
    headers = {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": api_key,
        "X-Goog-FieldMask": "places.displayName,places.formattedAddress",
    }
    body = json.dumps({"textQuery": query}).encode("utf-8")
    req = urllib_request.Request(url, data=body, headers=headers, method="POST")

    try:
        with urllib_request.urlopen(req, timeout=30) as response:
            payload = json.loads(response.read().decode("utf-8"))
            names = []
            for place in payload.get("places", []):
                name = str(((place.get("displayName") or {}).get("text")) or "").strip()
                if name and name not in names:
                    names.append(name)
                if len(names) >= limit:
                    break
            return names
    except Exception:
        return []


def research_google_places(row: Dict[str, Any], map_coordinates: Optional[Dict[str, float]]) -> Dict[str, Any]:
    api_key = os.getenv("Maps_API_KEY", "").strip()
    client = init_maps_client()

    if not map_coordinates:
        geocoded = geocode_address(row)
        map_coordinates = geocoded.get("map_coordinates")
        if not map_coordinates:
            return {"status": "skipped", "reason": geocoded.get("reason") or "missing coordinates"}

    lat = map_coordinates.get("lat")
    lng = map_coordinates.get("lng")
    if lat is None or lng is None:
        return {"status": "skipped", "reason": "invalid coordinates"}

    neighborhood = ""
    corridor = ""

    try:
        if client is not None:
            reverse = client.reverse_geocode((lat, lng))
            for result in reverse:
                types = result.get("types", [])
                if not neighborhood and any(t in types for t in ["neighborhood", "sublocality", "sublocality_level_1"]):
                    neighborhood = result.get("formatted_address", "")
                if not corridor and "route" in types:
                    corridor = result.get("formatted_address", "")
        elif api_key:
            query = urllib_parse.urlencode({"latlng": f"{lat},{lng}", "key": api_key})
            url = f"https://maps.googleapis.com/maps/api/geocode/json?{query}"
            with urllib_request.urlopen(url, timeout=30) as response:
                payload = json.loads(response.read().decode("utf-8"))
            for result in payload.get("results", []):
                types = result.get("types", [])
                if not neighborhood and any(t in types for t in ["neighborhood", "sublocality", "sublocality_level_1"]):
                    neighborhood = result.get("formatted_address", "")
                if not corridor and "route" in types:
                    corridor = result.get("formatted_address", "")
        else:
            return {"status": "skipped", "reason": "Maps_API_KEY missing"}

        corridor = corridor or build_property_address(row)
        city = row.get("city", "")
        state = row.get("state", "")
        near_phrase = f"near {build_property_address(row)}"

        return {
            "status": "ok",
            "neighborhood": neighborhood,
            "corridor": corridor,
            "anchor_tenants": google_places_text_search(f"retail shopping centers and anchor tenants {near_phrase} {city} {state}"),
            "restaurants": google_places_text_search(f"restaurants {near_phrase} {city} {state}"),
            "banks": google_places_text_search(f"banks {near_phrase} {city} {state}"),
            "map_coordinates": {"lat": lat, "lng": lng},
        }
    except Exception as exc:
        return {"status": "error", "error": str(exc)}


def research_public_records_placeholder(row: Dict[str, Any]) -> Dict[str, Any]:
    address = build_property_address(row)
    county = str(row.get("county", "")).strip().lower()
    parcel_id = str(row.get("parcel_id") or row.get("tax_id") or "").strip()

    if county in QPUBLIC_COUNTY_APPS:
        result = run_qpublic_scraper(address, county, parcel_id=parcel_id or None)
        result.setdefault("query", address)
        return result

    return {
        "status": "blocked",
        "source": "public-records-fallback",
        "query": address,
        "building_size_sf": None,
        "year_built": None,
        "lot_size_acres": None,
        "lot_size_sf": None,
        "exterior_construction_type": None,
        "parking": None,
        "assessor_improvements": None,
        "notes": [
            "Assessor scraper fallback not yet implemented for this address.",
        ],
    }


def generate_rule_based_copy(
    row: Dict[str, Any],
    assessor_result: Optional[Dict[str, Any]] = None,
    research: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    property_type = row.get("property_type", "Property") or "Property"
    city = row.get("city", "")
    county = row.get("county", "")
    transaction_type = row.get("transaction_type", "")
    subtype_id = BUILDOUT_PROPERTY_SUBTYPE_MAP.get(str(property_type).strip().lower())
    subtype_label = BUILDOUT_PROPERTY_SUBTYPE_ENUMS.get(subtype_id, property_type)

    transaction_phrase = "for Sale" if transaction_type.lower() == "for sale" else ("for Lease" if transaction_type.lower() == "for lease" else transaction_type)
    sale_title = f"{property_type} Property {transaction_phrase} in {city}".strip()
    sale_description = f"{property_type} property located in {city}, {county} County.".strip()
    location_description = f"Located along the {city} commercial corridor.".strip() if city else ""

    return {
        "sale_title": sale_title,
        "sale_description": sale_description,
        "location_description": location_description,
        "sale_bullets": [
            f"{subtype_label} format in {city}" if city else subtype_label,
            "Address confirmed from Launchpad intake",
            "Draft enrichment pending deeper public-record extraction",
        ],
        "exterior_description": "Exterior/construction details pending public-record research.",
        "property_subtype_id": subtype_id,
        "building_size_sf": normalize_integer(row.get("available_sf")),
        "year_built": None,
        "generator": "rule-based",
    }


BANNED_COPY_PHRASES = [
    "ideal for",
    "opportunity",
    "prime",
    "growing market",
    "bustling",
    "unparalleled",
    "premier",
    "strategic",
    "thriving",
    "perfect",
]


def contains_banned_copy(text: str) -> bool:
    lowered = text.lower()
    return any(phrase in lowered for phrase in BANNED_COPY_PHRASES)


def constrain_property_subtype_id(property_type: str, subtype_id: Optional[int]) -> Optional[int]:
    property_type_key = str(property_type or "").strip().lower()
    allowed = BUILDOUT_ALLOWED_SUBTYPES_BY_PROPERTY_TYPE.get(property_type_key, set())
    if subtype_id in allowed:
        return subtype_id
    return BUILDOUT_PROPERTY_SUBTYPE_MAP.get(property_type_key)


def generate_ai_copy(
    row: Dict[str, Any],
    assessor_result: Optional[Dict[str, Any]] = None,
    research: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    api_key = os.getenv("OPENAI_API_KEY", "").strip()
    model = os.getenv("OPENAI_MODEL", "openai/gpt-5.4").strip() or "openai/gpt-5.4"

    fallback = generate_rule_based_copy(row, assessor_result, research)

    if not api_key:
        return fallback

    property_address = build_property_address(row)
    property_type = row.get("property_type", "") or "Property"
    transaction_type = row.get("transaction_type", "") or "Listing"
    city = row.get("city", "")
    county = row.get("county", "")
    available_sf = row.get("available_sf", "")
    visibility = row.get("listing_price_visibility", "")
    price_amount = row.get("listing_price_amount", "")
    property_type_key = str(property_type).strip().lower()
    allowed_subtype_ids = sorted(BUILDOUT_ALLOWED_SUBTYPES_BY_PROPERTY_TYPE.get(property_type_key, set()))
    subtype_options = {k: BUILDOUT_PROPERTY_SUBTYPE_ENUMS[k] for k in allowed_subtype_ids}

    research_json = json.dumps(research or {}, indent=2, default=str)
    banned_csv = ", ".join(BANNED_COPY_PHRASES)
    price_text = "Price undisclosed" if visibility == "Undisclosed" or not price_amount else f"Price: {price_amount}"

    prompt = f"""
You are a CRE research + listing enrichment engine for PIER Commercial Real Estate.

Return strict JSON with exactly these keys:
- sale_title
- sale_description
- location_description
- sale_bullets
- exterior_description
- property_subtype_id
- building_size_sf
- year_built

Requirements:
- sale_title: macro focused, city-forward, practical, not cheesy
- sale_description: robust factual paragraph with site size, building size, construction/exterior, parking, and assessor/public-record improvements when supported by research
- location_description: detailed paragraph describing the corridor/neighborhood and specifically naming nearby retailers, restaurants, and banks when present in the research
- sale_bullets: array of 3 to 5 concise bullets
- exterior_description: concise factual description of facade, parking, and construction type
- property_subtype_id: choose the most accurate Buildout subtype ID from the enum list below
- building_size_sf: integer or null
- year_built: integer or null

Guardrails:
- Be factual, specific, and CRE-broker professional
- Do not invent facts not reasonably supported by the intake or research
- If research is weak, say less, not more
- Avoid these phrases: {banned_csv}
- Bullets should be short and useful, not marketing fluff
- Valid JSON only

Buildout Property Subtype Enum options for this property type only:
{json.dumps(subtype_options, indent=2)}

Listing intake:
- Transaction type: {transaction_type}
- Property type: {property_type}
- Address: {property_address}
- City: {city}
- County: {county}
- Available SF from intake: {available_sf or 'Not provided'}
- {price_text}

Research package:
{research_json}
""".strip()

    try:
        if OpenAI is not None:
            client = OpenAI(api_key=api_key)
            response = client.chat.completions.create(
                model=model,
                temperature=0.2,
                response_format={"type": "json_object"},
                messages=[
                    {
                        "role": "system",
                        "content": "You produce strict factual CRE enrichment JSON for Buildout payloads.",
                    },
                    {
                        "role": "user",
                        "content": prompt,
                    },
                ],
            )
            text = response.choices[0].message.content or ""
        else:
            body = json.dumps({
                "model": model,
                "temperature": 0.2,
                "response_format": {"type": "json_object"},
                "messages": [
                    {
                        "role": "system",
                        "content": "You produce strict factual CRE enrichment JSON for Buildout payloads.",
                    },
                    {
                        "role": "user",
                        "content": prompt,
                    },
                ],
            }).encode("utf-8")
            req = urllib_request.Request(
                "https://api.openai.com/v1/chat/completions",
                data=body,
                headers={
                    "Content-Type": "application/json",
                    "Authorization": f"Bearer {api_key}",
                },
                method="POST",
            )
            with urllib_request.urlopen(req, timeout=90) as response:
                payload = json.loads(response.read().decode("utf-8"))
            text = (((payload.get("choices") or [{}])[0].get("message") or {}).get("content")) or ""
        parsed = json.loads(text)
        sale_description = str(parsed.get("sale_description", "")).strip()
        location_description = str(parsed.get("location_description", "")).strip()
        if contains_banned_copy(sale_description) or contains_banned_copy(location_description):
            fallback["error"] = "AI enrichment used banned phrasing"
            return fallback
        selected_subtype = constrain_property_subtype_id(property_type, normalize_integer(parsed.get("property_subtype_id")))
        return {
            "sale_title": str(parsed.get("sale_title", "")).strip() or fallback.get("sale_title"),
            "sale_description": sale_description or fallback.get("sale_description"),
            "location_description": location_description or fallback.get("location_description"),
            "sale_bullets": parsed.get("sale_bullets") if isinstance(parsed.get("sale_bullets"), list) else fallback.get("sale_bullets"),
            "exterior_description": str(parsed.get("exterior_description", "")).strip() or fallback.get("exterior_description"),
            "property_subtype_id": selected_subtype or fallback.get("property_subtype_id"),
            "building_size_sf": normalize_integer(parsed.get("building_size_sf")) or fallback.get("building_size_sf"),
            "year_built": normalize_integer(parsed.get("year_built")),
            "generator": f"ai:{model}",
        }
    except Exception as exc:
        fallback["error"] = str(exc)
        print(f"OpenAI enrichment failed: {exc}")
        return fallback


def normalize_decimal_string_to_number(value: Any) -> Optional[float]:
    text = str(value or "").strip()
    if not text:
        return None
    cleaned = _CURRENCY_CLEAN_RE.sub("", text.replace(",", ""))
    if not cleaned or cleaned in {"-", ".", "-."}:
        return None
    try:
        return float(Decimal(cleaned))
    except InvalidOperation:
        return None


def normalize_integer(value: Any) -> Optional[int]:
    number = normalize_decimal_string_to_number(value)
    if number is None:
        return None
    return int(round(number))


def resolve_buildout_broker_id(row: Dict[str, Any]) -> int:
    lead_broker = str(row.get("lead_broker", "")).strip().lower()
    if "ryan" in lead_broker and "schneider" in lead_broker:
        return BUILDOUT_DEFAULT_BROKER_ID
    return BUILDOUT_DEFAULT_BROKER_ID


def append_property_website(description: Optional[str], website_url: Optional[str]) -> Optional[str]:
    base = str(description or "").strip()
    website = str(website_url or "").strip()
    if not website:
        return base or None

    website_line = f"Property Website: {website}"
    if website_line in base:
        return base or None
    if not base:
        return website_line
    return f"{base}\n\n{website_line}"


def build_buildout_payload(
    row: Dict[str, Any],
    ai_copy: Optional[Dict[str, Any]] = None,
    research: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    visibility = str(row.get("listing_price_visibility", "")).strip()
    price_amount = normalize_decimal_string_to_number(row.get("listing_price_amount"))
    available_sf = normalize_integer(row.get("available_sf"))
    asking_price_rate = normalize_decimal_string_to_number(row.get("asking_price_rate"))
    property_type_key = str(row.get("property_type", "")).strip().lower()
    transaction_type = str(row.get("transaction_type", "")).strip().lower()
    lease_type_key = str(row.get("lease_type", "")).strip().lower()
    map_coordinates = row.get("map_coordinates") or {}
    public_records = ((research or {}).get("public_records") or {}) if isinstance(research, dict) else {}
    assessor_building_size = normalize_integer(public_records.get("building_size_sf"))
    assessor_year_built = normalize_integer(public_records.get("year_built"))
    assessor_lot_size_acres = normalize_decimal_string_to_number(public_records.get("lot_size_acres"))
    assessor_zoning = public_records.get("zoning") or None
    enriched_building_size = assessor_building_size or normalize_integer((ai_copy or {}).get("building_size_sf")) or available_sf
    enriched_year_built = assessor_year_built or normalize_integer((ai_copy or {}).get("year_built"))
    enriched_subtype_id = normalize_integer((ai_copy or {}).get("property_subtype_id")) or BUILDOUT_PROPERTY_SUBTYPE_MAP.get(property_type_key)
    sale_bullets = (ai_copy or {}).get("sale_bullets") if isinstance((ai_copy or {}).get("sale_bullets"), list) else []

    website_url = str(row.get("website_url") or "").strip() or None

    property_payload: Dict[str, Any] = {
        "broker_id": resolve_buildout_broker_id(row),
        "address": build_property_address(row),
        "city": row.get("city") or None,
        "state": row.get("state") or None,
        "zip": row.get("zip_code") or None,
        "county": row.get("county") or None,
        "property_type_id": BUILDOUT_PROPERTY_TYPE_MAP.get(property_type_key),
        "property_subtype_id": enriched_subtype_id,
        "name": (ai_copy or {}).get("sale_title") or build_property_address(row),
        "latitude": map_coordinates.get("lat") if map_coordinates else None,
        "longitude": map_coordinates.get("lng") if map_coordinates else None,
        "external_id": row_state_key({FIELD_MAP["timestamp"]: row.get("timestamp", "")}, 0),
        "location_description": (ai_copy or {}).get("location_description") or None,
        "exterior_description": (ai_copy or {}).get("exterior_description") or None,
        "building_size_sf": enriched_building_size,
        "year_built": enriched_year_built,
        "lot_size_acres": assessor_lot_size_acres,
        "zoning": assessor_zoning,
    }

    if transaction_type == "for sale":
        property_payload.update(
            {
                "sale": True,
                "sale_deal_status_id": 1,
                "hide_sale_price": visibility == "Undisclosed",
                "hidden_price_label": BUILDOUT_DEFAULT_HIDDEN_PRICE_LABEL if visibility == "Undisclosed" else None,
                "sale_price_dollars": None if visibility == "Undisclosed" else price_amount,
                "sale_title": (ai_copy or {}).get("sale_title") or build_property_address(row),
                "sale_description": append_property_website(
                    (ai_copy or {}).get("sale_description") or "Launchpad draft listing.",
                    website_url,
                ),
                "sale_bullets": sale_bullets,
            }
        )
    elif transaction_type == "for lease":
        property_payload.update({
            "lease": True,
            "lease_deal_status_ids": [1],
        })

    payload = {
        "property": {k: v for k, v in property_payload.items() if v not in (None, "", [])},
        "meta": {
            "transactionType": row.get("transaction_type") or None,
            "propertyType": row.get("property_type") or None,
            "leadBroker": row.get("lead_broker") or None,
            "availableSqFt": available_sf,
            "askingPriceRatePerSf": asking_price_rate,
            "websiteUrl": website_url,
            "undisclosed": visibility == "Undisclosed",
            "intake": row,
            "research": research or {},
            "copy": ai_copy or {},
        },
    }

    if transaction_type == "for lease":
        lease_space = {
            "size_sf": available_sf,
            "lease_rate": None if visibility == "Undisclosed" else asking_price_rate,
            "hide_lease_rate": visibility == "Undisclosed",
            "hidden_lease_rate_label_override": BUILDOUT_DEFAULT_HIDDEN_PRICE_LABEL if visibility == "Undisclosed" else None,
            "lease_rate_units": "year",
            "lease_type_id": BUILDOUT_LEASE_TYPE_MAP.get(lease_type_key, 3),
            "deal_status_id": 1,
            "description": append_property_website(
                (ai_copy or {}).get("summary") or "Launchpad draft lease space.",
                website_url,
            ),
            "suite": row.get("unit_number") or None,
            "space_type_id": BUILDOUT_PROPERTY_SUBTYPE_MAP.get(property_type_key),
        }
        payload["lease_space"] = {k: v for k, v in lease_space.items() if v not in (None, "", [])}

    return payload


def save_buildout_payload(payload: Dict[str, Any], row: Dict[str, Any]) -> Dict[str, Any]:
    payload = dict(payload)

    os.makedirs(BUILDOUT_PAYLOAD_DIR, exist_ok=True)
    timestamp = re.sub(r"[^0-9A-Za-z_-]", "-", str(row.get("timestamp", "") or "row"))
    address_slug = re.sub(
        r"[^0-9A-Za-z_-]",
        "-",
        f"{row.get('street_number', '')}-{row.get('street_name', '')}-{row.get('city', '')}".strip("-"),
    )
    filename = f"buildout_{timestamp}_{address_slug}.json"
    output_path = os.path.join(BUILDOUT_PAYLOAD_DIR, filename)

    with open(output_path, "w", encoding="utf-8") as handle:
        json.dump(payload, handle, indent=2, default=str)

    return {
        "status": "saved",
        "path": output_path,
        "payload": payload,
    }


def build_buildout_base_url() -> str:
    base = os.getenv("BUILDOUT_API_BASE_URL", "https://buildout.com/api/v1").rstrip("/")
    api_key = os.getenv("BUILDOUT_API_KEY", "").strip()
    if not api_key:
        raise ValueError("BUILDOUT_API_KEY is missing")
    return f"{base}/{api_key}"


def _is_valid_matterport_url(value: Any) -> bool:
    text = str(value or "").strip()
    if not text:
        return True
    return bool(re.match(r"^https://my\.matterport\.com/show/\?m=[A-Za-z0-9]+$", text))


def sanitize_existing_buildout_urls(existing_property: Dict[str, Any], property_payload: Dict[str, Any]) -> Dict[str, Any]:
    cleanup_fields = ["matterport_url", "virtual_tour_url", "you_tube_url", "auction_url"]
    for field in cleanup_fields:
        if field in property_payload:
            continue
        existing_value = existing_property.get(field)
        if existing_value and not _is_valid_matterport_url(existing_value):
            property_payload[field] = ""
    return property_payload


def lookup_buildout_property_by_external_id(external_id: str) -> Dict[str, Any]:
    if not external_id:
        return {"status": "skipped", "reason": "missing external_id"}

    query = urllib_request.quote(external_id, safe="")
    url = f"{build_buildout_base_url()}/properties/lookup_external_ids.json?external_ids[]={query}"
    req = urllib_request.Request(
        url,
        headers={"Accept": "application/json"},
        method="GET",
    )

    try:
        with urllib_request.urlopen(req, timeout=60) as response:
            body = response.read().decode("utf-8")
            parsed = json.loads(body) if body else {}
            records = (parsed or {}).get("records") or {}
            property_record = records.get(external_id)
            if property_record:
                return {
                    "status": "found",
                    "url": url,
                    "response": parsed,
                    "property": property_record,
                }
            return {
                "status": "not_found",
                "url": url,
                "response": parsed,
            }
    except urllib_error.HTTPError as exc:
        error_body = exc.read().decode("utf-8", "ignore")
        try:
            parsed_error = json.loads(error_body) if error_body else {}
        except json.JSONDecodeError:
            parsed_error = {"raw": error_body}
        return {
            "status": "error",
            "url": url,
            "http_status": exc.code,
            "error": parsed_error,
        }


def fetch_buildout_active_inventory() -> Dict[str, Any]:
    page = 1
    per_page = int(os.getenv("BUILDOUT_PAGE_SIZE", "200"))
    collected: List[Dict[str, Any]] = []

    while True:
        params = urllib_parse.urlencode({"page": page, "per_page": per_page})
        url = f"{build_buildout_base_url()}/properties.json?{params}"
        req = urllib_request.Request(
            url,
            headers={"Accept": "application/json"},
            method="GET",
        )
        try:
            with urllib_request.urlopen(req, timeout=60) as response:
                body = response.read().decode("utf-8")
                parsed = json.loads(body) if body else {}
        except urllib_error.HTTPError as exc:
            error_body = exc.read().decode("utf-8", "ignore")
            try:
                parsed_error = json.loads(error_body) if error_body else {}
            except json.JSONDecodeError:
                parsed_error = {"raw": error_body}
            return {
                "status": "error",
                "url": url,
                "http_status": exc.code,
                "error": parsed_error,
            }

        properties = (parsed or {}).get("properties") or []
        if not properties:
            break
        collected.extend(properties)
        if len(properties) < per_page:
            break
        page += 1

    return {
        "status": "ok",
        "count": len(collected),
        "properties": collected,
    }


def normalize_buildout_address(value: Any) -> str:
    return re.sub(r"[^a-z0-9]", "", str(value or "").lower())


def lookup_buildout_property_by_address(property_payload: Dict[str, Any]) -> Dict[str, Any]:
    inventory_result = fetch_buildout_active_inventory()
    if inventory_result.get("status") != "ok":
        return {
            "status": "error",
            "reason": "inventory_fetch_failed",
            "inventory": inventory_result,
        }

    target_address = normalize_buildout_address(property_payload.get("address"))
    target_city = normalize_buildout_address(property_payload.get("city"))
    target_state = normalize_buildout_address(property_payload.get("state"))
    if not target_address:
        return {"status": "skipped", "reason": "missing address for fallback lookup"}

    exact_matches: List[Dict[str, Any]] = []
    street_matches: List[Dict[str, Any]] = []

    for prop in inventory_result.get("properties", []):
        candidate_address = normalize_buildout_address(prop.get("address"))
        candidate_city = normalize_buildout_address(prop.get("city"))
        candidate_state = normalize_buildout_address(prop.get("state"))
        if candidate_address != target_address:
            continue
        record = {
            "id": prop.get("id"),
            "name": prop.get("name"),
            "address": prop.get("address"),
            "city": prop.get("city"),
            "state": prop.get("state"),
            "external_id": prop.get("external_id"),
            "raw": prop,
        }
        street_matches.append(record)
        if candidate_city == target_city and candidate_state == target_state:
            exact_matches.append(record)

    matches = exact_matches or street_matches
    if not matches:
        return {
            "status": "not_found",
            "match_type": "address",
            "target": {
                "address": property_payload.get("address"),
                "city": property_payload.get("city"),
                "state": property_payload.get("state"),
            },
            "inventory_count": inventory_result.get("count"),
        }

    if len(matches) > 1:
        return {
            "status": "ambiguous",
            "match_type": "address",
            "target": {
                "address": property_payload.get("address"),
                "city": property_payload.get("city"),
                "state": property_payload.get("state"),
            },
            "matches": matches,
        }

    return {
        "status": "found",
        "match_type": "address",
        "property": matches[0],
        "inventory_count": inventory_result.get("count"),
    }


def sync_buildout_property(payload: Dict[str, Any], dry_run: bool = False) -> Dict[str, Any]:
    property_payload = payload.get("property") or {}
    if not property_payload:
        return {"status": "skipped", "reason": "missing property payload"}

    external_id = str(property_payload.get("external_id") or "").strip()
    lookup_result = lookup_buildout_property_by_external_id(external_id)
    if lookup_result.get("status") == "error":
        return {
            "status": "error",
            "reason": "external_id lookup failed",
            "external_id": external_id,
            "lookup": lookup_result,
        }

    address_lookup_result = None
    existing_property = (lookup_result or {}).get("property") or {}
    if not existing_property:
        address_lookup_result = lookup_buildout_property_by_address(property_payload)
        if address_lookup_result.get("status") == "error":
            return {
                "status": "error",
                "reason": "address fallback lookup failed",
                "external_id": external_id,
                "lookup": lookup_result,
                "address_lookup": address_lookup_result,
            }
        if address_lookup_result.get("status") == "ambiguous":
            return {
                "status": "error",
                "reason": "address fallback lookup ambiguous",
                "external_id": external_id,
                "lookup": lookup_result,
                "address_lookup": address_lookup_result,
            }
        existing_property = (address_lookup_result or {}).get("property") or {}

    existing_property_id = existing_property.get("id")

    if existing_property_id:
        url = f"{build_buildout_base_url()}/properties/{existing_property_id}.json"
        property_payload = dict(property_payload)
        if external_id and not existing_property.get("external_id"):
            property_payload["external_id"] = external_id
        property_payload = sanitize_existing_buildout_urls(existing_property, property_payload)
        request_payload = {"property": property_payload}
        match_type = "external_id" if (lookup_result or {}).get("status") == "found" else "address"
        if dry_run:
            return {
                "status": "dry_run_update",
                "url": url,
                "external_id": external_id,
                "existing_property_id": existing_property_id,
                "request_payload": request_payload,
                "lookup": lookup_result,
                "address_lookup": address_lookup_result,
                "match_type": match_type,
            }

        request_body = json.dumps(request_payload).encode("utf-8")
        req = urllib_request.Request(
            url,
            data=request_body,
            headers={"Content-Type": "application/json", "Accept": "application/json"},
            method="PUT",
        )

        try:
            with urllib_request.urlopen(req, timeout=60) as response:
                body = response.read().decode("utf-8")
                parsed = json.loads(body) if body else {}
                return {
                    "status": "updated",
                    "url": url,
                    "external_id": external_id,
                    "existing_property_id": existing_property_id,
                    "response": parsed,
                    "lookup": lookup_result,
                    "address_lookup": address_lookup_result,
                    "match_type": match_type,
                }
        except urllib_error.HTTPError as exc:
            error_body = exc.read().decode("utf-8", "ignore")
            try:
                parsed_error = json.loads(error_body) if error_body else {}
            except json.JSONDecodeError:
                parsed_error = {"raw": error_body}
            return {
                "status": "error",
                "url": url,
                "http_status": exc.code,
                "error": parsed_error,
                "request_payload": request_payload,
                "lookup": lookup_result,
                "address_lookup": address_lookup_result,
                "external_id": external_id,
                "existing_property_id": existing_property_id,
                "match_type": match_type,
            }

    url = f"{build_buildout_base_url()}/properties.json"
    request_payload = {"property": property_payload}
    if dry_run:
        return {
            "status": "dry_run_create",
            "url": url,
            "external_id": external_id,
            "request_payload": request_payload,
            "lookup": lookup_result,
            "address_lookup": address_lookup_result,
        }

    request_body = json.dumps(request_payload).encode("utf-8")
    req = urllib_request.Request(
        url,
        data=request_body,
        headers={"Content-Type": "application/json", "Accept": "application/json"},
        method="POST",
    )

    try:
        with urllib_request.urlopen(req, timeout=60) as response:
            body = response.read().decode("utf-8")
            parsed = json.loads(body) if body else {}
            return {
                "status": "created",
                "url": url,
                "external_id": external_id,
                "response": parsed,
                "lookup": lookup_result,
                "address_lookup": address_lookup_result,
            }
    except urllib_error.HTTPError as exc:
        error_body = exc.read().decode("utf-8", "ignore")
        try:
            parsed_error = json.loads(error_body) if error_body else {}
        except json.JSONDecodeError:
            parsed_error = {"raw": error_body}
        return {
            "status": "error",
            "url": url,
            "http_status": exc.code,
            "error": parsed_error,
            "request_payload": request_payload,
            "lookup": lookup_result,
            "address_lookup": address_lookup_result,
            "external_id": external_id,
        }


def post_buildout_lease_space(property_id: Any, payload: Dict[str, Any]) -> Dict[str, Any]:
    lease_space_payload = dict(payload.get("lease_space") or {})
    if not lease_space_payload:
        return {"status": "skipped", "reason": "missing lease_space payload"}
    lease_space_payload["property_id"] = property_id

    url = f"{build_buildout_base_url()}/lease_spaces.json"
    request_body = json.dumps({"lease_space": lease_space_payload}).encode("utf-8")
    req = urllib_request.Request(
        url,
        data=request_body,
        headers={"Content-Type": "application/json", "Accept": "application/json"},
        method="POST",
    )

    try:
        with urllib_request.urlopen(req, timeout=60) as response:
            body = response.read().decode("utf-8")
            parsed = json.loads(body) if body else {}
            return {"status": "ok", "url": url, "response": parsed}
    except urllib_error.HTTPError as exc:
        error_body = exc.read().decode("utf-8", "ignore")
        try:
            parsed_error = json.loads(error_body) if error_body else {}
        except json.JSONDecodeError:
            parsed_error = {"raw": error_body}
        return {
            "status": "error",
            "url": url,
            "http_status": exc.code,
            "error": parsed_error,
            "request_payload": {"lease_space": lease_space_payload},
        }


def load_state() -> Dict[str, Any]:
    if not os.path.exists(STATE_FILE):
        return {}
    try:
        with open(STATE_FILE, "r", encoding="utf-8") as handle:
            return json.load(handle)
    except (OSError, json.JSONDecodeError):
        return {}


def save_state(state: Dict[str, Any]) -> None:
    os.makedirs(os.path.dirname(STATE_FILE), exist_ok=True)
    with open(STATE_FILE, "w", encoding="utf-8") as handle:
        json.dump(state, handle, indent=2)


def row_state_key(row: Dict[str, Any], index: int) -> str:
    timestamp = str(row.get(FIELD_MAP["timestamp"], "") or "").strip()
    return timestamp or f"row-{index}"


def filter_new_rows(rows: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    state = load_state()
    last_processed = str(state.get("last_processed_key", "")).strip()
    if not last_processed:
        return rows[-1:] if rows else []

    new_rows: List[Dict[str, Any]] = []
    found_last = False
    for index, row in enumerate(rows):
        key = row_state_key(row, index)
        if found_last:
            new_rows.append(row)
        elif key == last_processed:
            found_last = True

    if not found_last and rows:
        return rows[-1:]
    return new_rows


def process_sheet_rows(rows: Iterable[Dict[str, Any]], dry_run: bool = False) -> List[Dict[str, Any]]:
    results: List[Dict[str, Any]] = []

    for raw_row in rows:
        sanitized = sanitize_sheet_row(raw_row)
        geocode_result = geocode_address(sanitized)
        map_coordinates = geocode_result.get("map_coordinates")
        sanitized["map_coordinates"] = map_coordinates
        county = sanitized.get("county", "")
        address = build_property_address(sanitized)
        assessor_result = route_to_assessor(county, address, sanitized)
        places_research = research_google_places(sanitized, map_coordinates)
        public_record_research = research_public_records_placeholder(sanitized)
        research = {
            "places": places_research,
            "public_records": public_record_research,
        }
        ai_copy = generate_ai_copy(sanitized, assessor_result, research)
        listingstream_result = write_to_listingstream(sanitized, map_coordinates, ai_copy)
        payload = build_buildout_payload(sanitized, ai_copy, research)
        buildout_artifact_result = save_buildout_payload(payload, sanitized)
        property_post_result = sync_buildout_property(payload, dry_run=dry_run)

        lease_space_post_result = {"status": "skipped", "reason": "not a lease listing"}
        if payload.get("lease_space") and property_post_result.get("status") in {"ok", "created", "updated"}:
            property_response = property_post_result.get("response") or {}
            property_obj = property_response.get("property") or {}
            property_id = property_obj.get("id") or property_post_result.get("existing_property_id")
            if property_id:
                lease_space_post_result = post_buildout_lease_space(property_id, payload)
            else:
                lease_space_post_result = {"status": "error", "reason": "property created but property.id missing in response"}

        logs = [
            "Fetched Launchpad row via public CSV export",
            "Applied exact CSV header field mapping",
            "Applied field sanitization",
            f"Geocode status: {geocode_result.get('status')}",
            f"ListingStream write status: {listingstream_result.get('status')} ({listingstream_result.get('write_status', 'n/a')})",
            f"County routing complete: {county}",
            f"Places research status: {places_research.get('status')}",
            f"Public-record research status: {public_record_research.get('status')}",
            "Generated AI enrichment",
            "Generated documented Buildout property payload",
            f"Saved Buildout payload locally: {buildout_artifact_result.get('path')}",
            f"Buildout property sync status: {property_post_result.get('status')}",
            f"Buildout lease_space POST status: {lease_space_post_result.get('status')}",
        ]
        if listingstream_result.get("status") == "error":
            logs.append(f"ListingStream warning: {listingstream_result.get('error')}")
        if property_post_result.get("status") == "error":
            logs.append(f"Buildout property sync error: HTTP {property_post_result.get('http_status')} {property_post_result.get('error')}")
        if property_post_result.get("status") == "updated":
            logs.append(
                f"Buildout property updated for external_id {property_post_result.get('external_id')} as ID {property_post_result.get('existing_property_id')}"
            )
        if property_post_result.get("status") == "created":
            created_id = ((property_post_result.get('response') or {}).get('property') or {}).get('id')
            logs.append(
                f"Buildout property created for external_id {property_post_result.get('external_id')} as ID {created_id}"
            )
        if property_post_result.get("status") == "dry_run_create":
            logs.append(f"Dry run only: would create Buildout property for external_id {property_post_result.get('external_id')}")
        if property_post_result.get("status") == "dry_run_update":
            logs.append(
                f"Dry run only: would update Buildout property for external_id {property_post_result.get('external_id')} as ID {property_post_result.get('existing_property_id')}"
            )
        if lease_space_post_result.get("status") == "error":
            logs.append(f"Buildout lease_space POST error: HTTP {lease_space_post_result.get('http_status')} {lease_space_post_result.get('error')}")

        results.append(
            {
                "logs": logs,
                "raw": raw_row,
                "sanitized": sanitized,
                "geocode": geocode_result,
                "listingstream": listingstream_result,
                "assessor": assessor_result,
                "ai_copy": ai_copy,
                "buildout": {
                    "artifact": buildout_artifact_result,
                    "property_post": property_post_result,
                    "lease_space_post": lease_space_post_result,
                },
            }
        )

    return results


def poll_once(
    newest_only: bool = False,
    dry_run: bool = False,
    row_timestamp: Optional[str] = None,
) -> List[Dict[str, Any]]:
    rows = fetch_sheet_rows()
    if row_timestamp:
        target = str(row_timestamp).strip()
        rows = [row for row in rows if str(row.get(FIELD_MAP["timestamp"], "") or "").strip() == target]
    elif newest_only and rows:
        rows = [rows[-1]]
    return process_sheet_rows(rows, dry_run=dry_run)


def run_daemon(interval_seconds: int = DEFAULT_POLL_INTERVAL_SECONDS) -> None:
    while True:
        rows = fetch_sheet_rows()
        new_rows = filter_new_rows(rows)
        if new_rows:
            results = process_sheet_rows(new_rows)
            newest_row = new_rows[-1]
            newest_key = row_state_key(newest_row, len(rows) - 1)
            save_state({"last_processed_key": newest_key, "last_seen_count": len(rows)})
            print(json.dumps(results, indent=2, default=str))
        else:
            print("No new Launchpad rows detected")
        time.sleep(interval_seconds)


def main() -> None:
    bootstrap_env()

    parser = argparse.ArgumentParser(description="PIER Listing Launchpad runner")
    parser.add_argument("--daemon", action="store_true", help="Run the continuous 5-minute polling loop")
    parser.add_argument(
        "--all",
        action="store_true",
        help="Process all rows instead of only the newest row during one-shot execution",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Run lookup/idempotency checks and print what would happen without creating Buildout records",
    )
    parser.add_argument(
        "--row-timestamp",
        help="Process only the row whose Timestamp matches exactly",
    )
    args = parser.parse_args()

    if args.daemon:
        run_daemon()
        return

    results = poll_once(newest_only=not args.all, dry_run=args.dry_run, row_timestamp=args.row_timestamp)
    print(json.dumps(results, indent=2, default=str))


if __name__ == "__main__":
    main()
