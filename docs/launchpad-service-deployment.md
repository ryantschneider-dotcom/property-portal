# Launchpad Service Deployment

## What changed

- The Vercel-hosted Next.js portal no longer tries to execute Python locally.
- The portal now calls an external enrichment API using:
  - `LAUNCHPAD_SERVICE_URL`
  - `LAUNCHPAD_SERVICE_TOKEN`
  - `LAUNCHPAD_SERVICE_TIMEOUT_MS`
- The Python enrichment service is packaged in `services/launchpad-service/`.

## Service package contents

- `services/launchpad-service/app.py` — Flask API wrapper around `scripts/listing_launchpad.py`
- `services/launchpad-service/requirements.txt` — Python dependencies
- `services/launchpad-service/.env.example` — service env template
- `services/launchpad-service/start.sh` — local start script
- `services/launchpad-service/com.pier.launchpad-service.plist.example` — launchd template for Mac Mini

## API contract

### `GET /health`
Returns a basic health payload.

### `POST /enrich`
Headers:
- `Authorization: Bearer <LAUNCHPAD_SERVICE_TOKEN>` if token is set

JSON body:
```json
{
  "row": {"street_name": "123 Main St", "city": "Savannah", "state": "GA"},
  "mapCoordinates": {"lat": 32.08, "lng": -81.09}
}
```

Response:
```json
{
  "public_records": {},
  "places": {},
  "research": {},
  "ai_copy": {}
}
```

## Portal env vars

Set these in the Vercel project for production:

```bash
LAUNCHPAD_SERVICE_URL=http://YOUR-MAC-MINI-IP-OR-TUNNEL:8787
LAUNCHPAD_SERVICE_TOKEN=replace-with-shared-secret
LAUNCHPAD_SERVICE_TIMEOUT_MS=60000
```

## Recommended network pattern

Preferred:
- run the service on the Mac Mini
- expose it privately through a trusted tunnel or reverse proxy
- keep token auth enabled
- restrict inbound access to the portal/tunnel path only when practical

## Notes

- If the external service is unavailable, the portal still falls back to a native Node enrichment path for partial data, but that fallback does **not** replace the full Python launchpad pipeline.
- The old Docker/Vercel Python-runtime assumption should not be used going forward.
