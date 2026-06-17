# PIER Manager → Property Portal Integration: First 33% Plan

## Corrected Architecture Acknowledgement

Listings bypass WordPress entirely. The public-facing listing experience is served by the existing `property-portal`, including the iframe/public listing site. The `pier-manager` frontend should operate as the broker-facing manager surface and wire directly to `property-portal` backend APIs for listing intake, AI review/revision, media handling, active listing lookup, and approved publish/update actions.

## Goal for First 33%

Establish the direct integration foundation and complete the broker-facing UI/API contract for two workflows without publishing anything automatically:

1. New listing uptake with minimal required fields and AI-generated draft review loop.
2. Existing listing modification with active-listing dropdown, plain-text edit instructions, media upload support, and draft/review-safe backend calls.

This first checkpoint should end with wiring and tests in place, but not the final polished implementation or production activation.

## Current Context Observed

- `property-portal` already exposes broker/admin listing endpoints:
  - `/api/broker/intake` — multipart listing intake; currently requires more structured fields than Ryan wants for minimal broker input.
  - `/api/broker/active-listings` — returns active listings for dropdown use.
  - `/api/broker/revisions` — accepts property edit instructions and assets; currently uses a deterministic/interpreter-style update path.
  - `/api/admin/properties/enrich`, `/approve`, `/save`, and related workflow routes exist for enrichment/approval.
- `property-portal` has existing media handling through `uploadBrokerAsset`.
- `pier-manager`/Mission Control has frontend surfaces and draft tooling but needs direct portal-backed listing manager screens/routes instead of WordPress listing assumptions.
- Existing user mandate: public listing site is the existing `property-portal`; no WordPress listing integration.

## First 33% Work Plan

### 1. Map the API contract and data flow

- Inspect `property-portal` routes and shared libs in detail:
  - `src/app/api/broker/intake/route.ts`
  - `src/app/api/broker/active-listings/route.ts`
  - `src/app/api/broker/revisions/route.ts`
  - `src/app/api/admin/properties/enrich/route.ts`
  - `src/app/api/admin/properties/approve/route.ts`
  - `src/lib/property-enrichment.ts`
  - `src/lib/broker-edit-interpreter.ts`
  - `src/lib/broker-hub.ts`
- Identify exact payloads currently accepted vs. the minimal broker fields Ryan wants.
- Define a stable `pier-manager` client adapter so the frontend never calls WordPress for listing work.

### 2. Frontend shell for new listing uptake

Create or update the `pier-manager` listing uptake UI with only these required broker inputs:

- Address
- Basic specs
- Price / rate / unpriced indicator
- Raw broker notes
- Media uploads

Expected first-33% deliverable:

- Form state and validation for minimal fields.
- Multipart submit path to the portal-backed adapter/API.
- Draft status panel placeholder showing: submitted → AI draft pending → ready for review.
- No direct publish on submit.

### 3. Frontend shell for AI review loop

Implement the draft review UX contract:

- Display cloud-writer-enriched listing draft back to broker.
- Broker actions:
  - `Approve` → only then publish/mark live in `property-portal`.
  - Plain-text feedback → send back for AI revision.
- First 33% will implement the UI states and API call boundaries, not necessarily every final field mapper.

### 4. Frontend shell for existing listing modification

Implement the modification panel:

- Dynamic dropdown populated from `property-portal` active listings endpoint.
- Plain-text instruction box.
- Media upload dropzone for documents/flyers/photos.
- Submit button routes to portal-backed revision endpoint.
- Status feedback: submitted, AI applying/reviewing, updated/pending review.

### 5. Backend adapter layer in `pier-manager`

Add a small server/client adapter in Mission Control/pier-manager that:

- Reads portal base URL from env/config.
- Fetches active listings from property-portal.
- Submits new-listing intake as multipart form data.
- Submits listing modification requests as multipart form data.
- Keeps credentials/session handling private and avoids browser-exposed secrets.
- Explicitly avoids WordPress endpoints for listings.

### 6. TDD / validation for checkpoint

Add tests before finalizing first-33% code:

- New listing form requires only the minimal mandated fields.
- Active listing dropdown calls the property-portal active listings endpoint.
- Modification submit sends selected listing ID, plain-text instructions, and uploaded assets.
- No listing flow imports or calls WordPress listing code.
- Approval is the only path that can mark a listing live.

## Likely Files to Change

In `mission-control/mission-control-app` / pier-manager:

- Listing manager frontend page/component files under `src/app`, `src/components`, or existing listing-related surfaces.
- New portal adapter, likely `src/lib/property-portal-client.ts` or similar.
- API proxy routes if needed under `src/app/api/...` to protect credentials/session.
- Tests under `tests/` for form behavior, adapter calls, and no-WordPress boundaries.

Potentially in `/Users/macclaw/property-portal`:

- Broker intake endpoint may need a minimal-payload mode.
- Revision endpoint may need a cloud-writer path instead of only deterministic interpretation.
- Approval/enrichment endpoints may need small contract adjustments to support pier-manager-initiated review loop.

## Non-Goals for First 33%

- No WordPress listing integration.
- No automatic live publishing on new listing submission.
- No production schedule/automation activation.
- No destructive data migrations.
- No bypassing broker approval.

## Checkpoint Definition: 33%

Pause and request Ryan’s authorization when:

- Direct property-portal integration contract is mapped.
- Minimal new-listing uptake UI/API boundary is implemented or stubbed with tests.
- Existing listing dropdown + edit instruction/media submission boundary is implemented or stubbed with tests.
- Draft/review/approve workflow states are represented.
- Verification confirms no WordPress listing path is used.

At that point, report exactly what is wired, what remains, and wait for authorization before moving toward the 66% implementation phase.
