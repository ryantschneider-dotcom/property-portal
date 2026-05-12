# OM Draft Workflow V1

Draft-only n8n workflow for OM generation.

## Purpose
- receive OM draft requests by webhook
- build normalized OM input
- save OM input snapshot to Firebase Storage
- send drafting request to OpenClaw using the locked Ticket 5 contract
- validate response shape
- save narrative snapshot to Firebase Storage
- update Firestore `om.status`
- respond with success/failure JSON

## Webhook
- Path: `POST /webhook/om-draft-v1`

### Expected request body
```json
{
  "propertyId": "prop_123",
  "template": "standard-om-v1",
  "mode": "draft"
}
```

## Required environment variables
- `OM_SERVICE_BASE_URL`
- `OM_SERVICE_TOKEN`
- `ASSET_SERVICE_BASE_URL`
- `ASSET_SERVICE_TOKEN`
- `OPENCLAW_BASE_URL`
- `OPENCLAW_TOKEN`

## Internal HTTP contracts expected by workflow

### `POST {OM_SERVICE_BASE_URL}/api/om/status`
```json
{
  "propertyId": "prop_123",
  "patch": {
    "om": {
      "status": "assembling"
    }
  },
  "runId": "run_123"
}
```

### `POST {OM_SERVICE_BASE_URL}/api/om/build-input`
```json
{
  "propertyId": "prop_123",
  "template": "standard-om-v1"
}
```

Response:
```json
{
  "ok": true,
  "input": {},
  "warnings": []
}
```

### `POST {ASSET_SERVICE_BASE_URL}/api/assets/write-json`
```json
{
  "propertyId": "prop_123",
  "storagePath": "properties/prop_123/private/generated/om-input/run_123.json",
  "content": {},
  "contentType": "application/json",
  "isPublic": false,
  "metadata": {
    "runId": "run_123",
    "template": "standard-om-v1",
    "artifactType": "om_input_snapshot"
  }
}
```

### `POST {OPENCLAW_BASE_URL}/api/om/draft`
Request body is the exact Ticket 5 OpenClaw draft request object.

## Storage paths generated inside workflow
- `properties/{propertyId}/private/generated/om-input/{runId}.json`
- `properties/{propertyId}/private/generated/narrative/{runId}.json`
- reserved for later phases:
  - `properties/{propertyId}/private/generated/html/{runId}/v1.html`
  - `properties/{propertyId}/private/generated/om-drafts/{runId}/v1.pdf`

## Firestore status flow
- `assembling`
- `drafting`
- `draft_ready`
- `failed`

## Review notes
- This workflow intentionally stops before HTML/PDF rendering.
- Storage writes are routed through internal service endpoints, not direct Firebase nodes.
- Path generation mirrors the Ticket 2 storage routing convention for auditability.
