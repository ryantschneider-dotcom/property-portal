# Phase 3 — Approval Workflow + Buildout-Ready Export

## Firestore schema additions

```ts
workflowStatus:
  | "draft"
  | "enriching"
  | "review"
  | "ready_for_approval"
  | "approved"
  | "needs_input"
  | "published"

meta: {
  approval?: {
    status: "pending" | "approved" | "rejected"
    submittedAt?: Timestamp
    submittedBy?: string
    decidedAt?: Timestamp
    decidedBy?: string
    decisionNote?: string
    rejectionReason?: string
  }
  export?: {
    buildoutReady?: boolean
    buildoutPayloadVersion?: string
    buildoutLastGeneratedAt?: Timestamp
    buildoutLastGeneratedBy?: string
    buildoutSyncStatus?: "not_ready" | "ready" | "error"
    buildoutSyncError?: string | null
    missingRequiredFields?: string[]
    warnings?: string[]
    payloadPreview?: Record<string, unknown>
  }
}
```

## API contract

### POST `/api/admin/properties/approve`
Body:
```json
{ "slug": "string", "note": "optional string" }
```
Response:
```json
{ "success": true, "slug": "...", "workflowStatus": "approved", "approvalStatus": "approved" }
```

### POST `/api/admin/properties/reject`
Body:
```json
{ "slug": "string", "note": "optional string", "reason": "optional string" }
```
Response:
```json
{ "success": true, "slug": "...", "workflowStatus": "needs_input", "approvalStatus": "rejected" }
```

### POST `/api/admin/properties/export-buildout`
Body:
```json
{ "slug": "string" }
```
Response:
```json
{
  "success": true,
  "slug": "...",
  "ready": true,
  "missingRequiredFields": [],
  "warnings": [],
  "payload": { "...buildout-ready preview...": true }
}
```

## UI states

### Broker
- `draft`
- `review`
- `ready_for_approval`
- `needs_input`

### Admin
- sees approval panel on edit screen
- can approve with note
- can reject / send back with note
- can generate Buildout-ready payload preview
- sees export readiness, missing fields, warnings, and payload summary

## Implementation sequencing
1. approval metadata + workflow routes
2. export payload generator
3. edit-screen approval/export panel
4. dashboard surfacing for approved/export-ready counts
5. later: real Buildout API push as a separate phase
