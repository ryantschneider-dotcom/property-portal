#!/usr/bin/env python3
"""Deterministic live source collector for PIER Pulse.

Reads a JSON config containing RSS/Atom and simple agenda HTML sources and prints a
PierPulseLiveCollectorResult JSON envelope. Network and parse errors are captured
in `errors` so the Mission Control run can continue.
"""
from __future__ import annotations

import argparse
import email.utils
import html
import json
import re
import sys
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from html.parser import HTMLParser
from pathlib import Path
from typing import Any
from xml.etree import ElementTree as ET

CRE_TOPIC_TERMS = {
    "sublease": ["sublease", "sublet", "space available", "available space", "availability"],
    "rent": ["asking rent", "lease rate", "rental rate", "rent tracking", "reduced rent", "rent moving", "psf"],
    "office": ["office", "medical office", "professional office"],
    "industrial": ["warehouse", "industrial", "logistics", "port", "distribution"],
    "retail": ["retail", "outparcel", "restaurant", "shopping"],
    "leasing": ["lease", "leasing", "tenant", "occupancy", "absorption"],
    "development": ["development", "construction", "site plan", "site", "annexation", "development agreement", "proposed development"],
    "zoning": ["zoning", "planning", "hearing", "rezoning", "variance", "special use", "special-use", "conditional use", "entitlement"],
    "agenda": ["agenda", "planning commission", "county commission", "city council", "public meeting", "authority", "board", "work session", "hearing"],
    "permit": ["permit", "building permit", "approved", "application", "site plan review", "plan review"],
    "project": ["project", "new project", "project announcement", "site plan review", "delivery", "pipeline", "expansion", "tenant improvement"],
    "event": ["event", "groundbreaking", "ribbon cutting", "grand opening"],
    "infrastructure": ["road", "infrastructure", "interchange", "water", "sewer", "utility", "approval", "capacity", "substation", "power", "electrical", "rail", "airport", "port", "logistics", "SPLOST", "TSPLOST", "CIP", "impact fee"],
}


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--config", required=True)
    parser.add_argument("--collected-at", default=None)
    args = parser.parse_args()

    config = json.loads(Path(args.config).read_text(encoding="utf-8"))
    collected_at = args.collected_at or datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
    result = {
        "collectorId": str(config["collectorId"]),
        "corridor": str(config["corridor"]),
        "collectedAt": collected_at,
        "candidates": [],
        "errors": [],
    }

    for source in config.get("sources", []):
        try:
            source_type = source.get("type")
            if source_type in {"rss", "atom"}:
                result["candidates"].extend(collect_feed(source, config))
            elif source_type == "agenda_html":
                result["candidates"].extend(collect_agenda_html(source, config))
            else:
                result["errors"].append(f"unsupported source type: {source_type}")
        except Exception as exc:  # intentionally non-fatal
            result["errors"].append(f"{source.get('name', 'source')}: {exc}")

    seen = set()
    deduped = []
    for candidate in result["candidates"]:
        key = candidate["url"].strip().lower()
        if key in seen:
            continue
        seen.add(key)
        deduped.append(candidate)
    result["candidates"] = deduped
    print(json.dumps(result, ensure_ascii=False, sort_keys=True))
    return 0


def read_url(url: str, timeout: int = 20) -> str:
    parsed = urllib.parse.urlparse(url)
    if parsed.scheme == "file":
        return Path(urllib.request.url2pathname(parsed.path)).read_text(encoding="utf-8")
    request = urllib.request.Request(url, headers={"User-Agent": "PIER-Pulse-Collector/1.0"})
    with urllib.request.urlopen(request, timeout=timeout) as response:  # nosec: deterministic configured URLs
        return response.read().decode("utf-8", errors="replace")


def collect_feed(source: dict[str, Any], config: dict[str, Any]) -> list[dict[str, Any]]:
    text = read_url(str(source["url"]))
    root = ET.fromstring(text)
    items = root.findall(".//item") or root.findall(".//{http://www.w3.org/2005/Atom}entry")
    candidates = []
    for item in items[: int(source.get("limit", 20))]:
        title = first_text(item, ["title", "{http://www.w3.org/2005/Atom}title"])
        url = first_text(item, ["link"])
        if not url:
            link_node = item.find("{http://www.w3.org/2005/Atom}link")
            url = link_node.attrib.get("href", "") if link_node is not None else ""
        summary = clean_html(first_text(item, ["description", "summary", "{http://www.w3.org/2005/Atom}summary", "{http://www.w3.org/2005/Atom}content"]))
        if not should_include_text(f"{title} {summary}", source):
            continue
        published = parse_date(first_text(item, ["pubDate", "published", "updated", "{http://www.w3.org/2005/Atom}published", "{http://www.w3.org/2005/Atom}updated"]))
        candidate = build_candidate(title, url, str(source["name"]), summary, published, config)
        if candidate:
            candidates.append(candidate)
    return candidates


def should_include_text(text: str, source: dict[str, Any]) -> bool:
    haystack = text.lower()
    include_terms = [str(term).lower() for term in source.get("includeTerms", [])]
    exclude_terms = [str(term).lower() for term in source.get("excludeTerms", [])]
    if include_terms and not any(term in haystack for term in include_terms):
        return False
    if exclude_terms and any(term in haystack for term in exclude_terms):
        return False
    return True


def collect_agenda_html(source: dict[str, Any], config: dict[str, Any]) -> list[dict[str, Any]]:
    parser = LinkParser()
    parser.feed(read_url(str(source["url"])))
    base = str(source["url"])
    terms = [term.lower() for term in source.get("includeTerms", [])]
    candidates = []
    for text, href in parser.links[: int(source.get("limit", 30))]:
        title = clean_html(text)
        if not title or (terms and not any(term in title.lower() for term in terms)):
            continue
        url = urllib.parse.urljoin(base, href)
        summary = (
            "Under-the-radar government agenda/source item flagged for commercial real estate review: "
            f"{title}. Preserve the public-body/source name, agenda item title, hearing context, roads/parcels/project names if present, "
            "and any zoning, entitlement, infrastructure, utility-capacity, permit, or pipeline-development implications."
        )
        candidate = build_candidate(title, url, str(source["name"]), summary, "", config)
        if candidate:
            candidates.append(candidate)
    return candidates


def build_candidate(title: str, url: str, source_name: str, summary: str, published_at: str, config: dict[str, Any]) -> dict[str, Any] | None:
    title = clean_html(title)
    url = html.unescape(url.strip())
    if not title or not url:
        return None
    haystack = f"{title} {summary}".lower()
    topics = [topic for topic, terms in CRE_TOPIC_TERMS.items() if any(term in haystack for term in terms)]
    if not topics:
        topics = ["development"] if any(term in haystack for term in ["agenda", "planning", "project"]) else ["other"]
    facts = [summary[:220]] if summary else [title]
    return {
        "title": title,
        "url": url,
        "sourceName": source_name,
        "publishedAt": published_at,
        "summary": summary or title,
        "topics": topics,
        "facts": facts,
        "corridorHint": str(config.get("corridorHint", "")),
    }


def first_text(node: ET.Element, names: list[str]) -> str:
    for name in names:
        found = node.find(name)
        if found is not None and found.text:
            return found.text.strip()
    return ""


def clean_html(value: str) -> str:
    value = re.sub(r"<[^>]+>", " ", value or "")
    return re.sub(r"\s+", " ", html.unescape(value)).strip()


def parse_date(value: str) -> str:
    if not value:
        return ""
    try:
        parsed = email.utils.parsedate_to_datetime(value)
        if parsed.tzinfo is None:
            parsed = parsed.replace(tzinfo=timezone.utc)
        return parsed.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")
    except Exception:
        return value.strip()


class LinkParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self.links: list[tuple[str, str]] = []
        self._href: str | None = None
        self._text: list[str] = []

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        if tag.lower() == "a":
            attrs_dict = dict(attrs)
            self._href = attrs_dict.get("href") or ""
            self._text = []

    def handle_data(self, data: str) -> None:
        if self._href is not None:
            self._text.append(data)

    def handle_endtag(self, tag: str) -> None:
        if tag.lower() == "a" and self._href is not None:
            text = " ".join(self._text).strip()
            if text and self._href:
                self.links.append((text, self._href))
            self._href = None
            self._text = []


if __name__ == "__main__":
    sys.exit(main())
