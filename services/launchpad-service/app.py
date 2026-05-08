#!/usr/bin/env python3
from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Any, Dict, Optional

from flask import Flask, jsonify, request

try:
    from dotenv import load_dotenv
except ImportError:  # pragma: no cover
    load_dotenv = None

SERVICE_DIR = Path(__file__).resolve().parent
PORTAL_ROOT = SERVICE_DIR.parent.parent
WORKSPACE_ROOT = PORTAL_ROOT.parent
ENV_CANDIDATES = [
    SERVICE_DIR / ".env",
    PORTAL_ROOT / ".env.local",
    PORTAL_ROOT / ".env",
    WORKSPACE_ROOT / "scripts" / ".env",
]
LAUNCHPAD_PATH_CANDIDATES = [
    PORTAL_ROOT / "scripts" / "listing_launchpad.py",
    WORKSPACE_ROOT / "scripts" / "listing_launchpad.py",
]

for env_path in ENV_CANDIDATES:
    if load_dotenv and env_path.exists():
        load_dotenv(env_path, override=False)

SERVICE_TOKEN = os.getenv("LAUNCHPAD_SERVICE_TOKEN", "").strip()

app = Flask(__name__)

_launchpad_module = None


def _resolve_launchpad_path() -> Path:
    for candidate in LAUNCHPAD_PATH_CANDIDATES:
        if candidate.exists():
            return candidate
    raise FileNotFoundError("listing_launchpad.py not found in expected workspace locations")


def _load_launchpad_module():
    global _launchpad_module
    if _launchpad_module is not None:
        return _launchpad_module

    import importlib.util

    launchpad_path = _resolve_launchpad_path()
    spec = importlib.util.spec_from_file_location("listing_launchpad", str(launchpad_path))
    if spec is None or spec.loader is None:
        raise RuntimeError(f"Unable to load launchpad module from {launchpad_path}")

    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    _launchpad_module = module
    return module


def _authorized() -> bool:
    if not SERVICE_TOKEN:
        return True
    auth_header = request.headers.get("Authorization", "")
    return auth_header == f"Bearer {SERVICE_TOKEN}"


@app.get("/health")
def health():
    try:
        launchpad_path = _resolve_launchpad_path()
        return jsonify({
            "ok": True,
            "service": "launchpad-service",
            "launchpad_path": str(launchpad_path),
        })
    except Exception as exc:  # pragma: no cover
        return jsonify({"ok": False, "error": str(exc)}), 500


@app.post("/enrich")
def enrich():
    if not _authorized():
        return jsonify({"error": "Unauthorized"}), 401

    payload = request.get_json(silent=True) or {}
    row = payload.get("row") or {}
    map_coordinates = payload.get("mapCoordinates")
    if not isinstance(row, dict):
        return jsonify({"error": "row must be an object"}), 400
    if map_coordinates is not None and not isinstance(map_coordinates, dict):
        return jsonify({"error": "mapCoordinates must be an object or null"}), 400

    try:
        module = _load_launchpad_module()
        public_records = module.research_public_records_placeholder(row)
        places = module.research_google_places(row, map_coordinates)
        research = module.enrich_research_package(row, public_records, {
            "public_records": public_records,
            "places": places,
        })
        public_records = research.get("public_records") or public_records
        places = research.get("places") or places
        ai_copy = module.generate_ai_copy(row, public_records, research)

        return jsonify({
            "public_records": public_records,
            "places": places,
            "research": research,
            "ai_copy": ai_copy,
        })
    except Exception as exc:
        return jsonify({
            "error": str(exc),
            "row": row,
        }), 500


if __name__ == "__main__":
    host = os.getenv("LAUNCHPAD_SERVICE_HOST", "127.0.0.1")
    port = int(os.getenv("LAUNCHPAD_SERVICE_PORT", "8787"))
    app.run(host=host, port=port)
