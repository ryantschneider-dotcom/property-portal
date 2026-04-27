# Listing Intake + Draft Review V1 Spec

## Purpose

Build the minimum viable multi-user listing workflow for PIER Commercial so associate brokers can:
- log in with their own credentials
- submit a lightweight listing intake form
- upload photos during intake
- let the system auto-build a draft listing
- review/edit generated content and enriched property facts
- save and prepare the listing for approval

This is not just an admin editor anymore.
This is a broker-facing draft-listing workflow.

---

## V1 Product Goal

Create a fast, operator-grade listing pipeline where:
1. a broker submits a short intake
2. the system enriches the property automatically
3. the system generates strong draft copy automatically
4. the broker reviews/edits the draft
5. admin can oversee all listings and approve/publish later

Core rule:
**minimum visible fields, maximum useful automation**

---

## Users and Roles

### 1. Admin
Can:
- view all listings
- edit all listings
- create listings manually
- review all broker drafts
- approve/publish listings
- manage broker accounts

### 2. Broker
Can:
- log in with email + password
- create new listings via intake form
- upload photos
- view only their own listings by default
- edit their own draft listings
- save and mark a draft ready for review

### Recommended user fields
- `id`
- `email`
- `name`
- `role` (`admin` | `broker`)
- `active`
- `createdAt`
- `updatedAt`

---

## Ownership Model

Each listing should carry explicit ownership metadata.

### Required ownership fields
- `ownerUserId`
- `ownerEmail`
- `leadBroker`
- `createdByUserId`
- `updatedByUserId`
- `createdAt`
- `updatedAt`

### Behavior
- brokers only edit their own listings in V1
- admin can edit all
- owner info should be visible in admin views, not necessarily prominent in broker views

---

## Listing Status Flow

Keep statuses simple.

### Recommended statuses
- `draft`
- `enriching`
- `review`
- `ready_for_approval`
- `approved`
- `published`
- `needs_input`

### V1 status rules
- intake submit → `draft`
- enrichment running → `enriching`
- enrichment complete → `review`
- broker marks ready → `ready_for_approval`
- admin approves → `approved`
- later publishing flow can set → `published`
- if critical facts are missing → `needs_input`

---

## Intake Form (Broker Quick Submit)

This should be short and easy.
It is not the full editor.

### Required intake fields
- property title / name
- transaction type
- property type
- street address
- city
- state
- zip
- photo upload

### Strongly recommended optional fields
- parcel ID
- county
- listing price amount
- listing price visibility
- asking lease rate
- available SF
- building SF
- lot size acres
- year built
- zoning
- lease type
- website URL
- broker notes

### Intake form principles
- short enough for associate brokers to actually use
- enough data to identify and enrich the property
- enough structure to generate a useful draft
- photos uploaded immediately with the intake

---

## Photo Upload Handling

Photo upload is part of the intake flow, not a later add-on.

### V1 photo requirements
- upload multiple photos
- store image records on the listing draft immediately
- allow selecting a primary photo
- allow deleting/reordering in draft review

### Recommended stored image structure
```ts
media: {
  heroImageUrl: string | null,
  images: Array<{
    id: string,
    url: string,
    filename: string,
    caption: string | null,
    sortOrder: number,
    isPrimary: boolean,
    uploadedByUserId: string | null,
    uploadedAt: string | null,
  }>
}
```

### V1 note
A full media-management system is out of scope.
Need only:
- upload
- attach to listing
- display thumbnails
- primary image selection
- basic reorder/remove

---

## Draft Listing Record

The intake should create a canonical draft listing record.

### Draft record should contain
#### A. Ownership + workflow
- slug
- title
- status
- ownerUserId
- ownerEmail
- leadBroker
- createdByUserId
- updatedByUserId
- createdAt
- updatedAt

#### B. Canonical listing facts
- transaction type
- property type / subtype
- address
- parcel ID
- zoning
- building SF
- lot size acres
- year built
- available SF
- sale price
- asking rate
- lease type

#### C. Generated/enriched content
- sale title
- property description
- neighborhood/location description
- exterior description
- bullet points
- neighborhood
- corridor
- anchor tenants
- nearby restaurants
- nearby banks

#### D. Source metadata
- raw intake payload
- raw assessor data
- raw enrichment data
- generation metadata
- source URLs / provenance

Important:
- canonical fields are what the UI edits prominently
- raw metadata stays preserved but mostly hidden/collapsed

---

## Enrichment Pipeline

After intake submission, the system should enrich automatically.

### Enrichment responsibilities
#### 1. Missing-field detection
Classify fields into:
- already provided
- recoverable automatically
- still needs human input

#### 2. Assessor / parcel research
Pull if available:
- parcel ID
- building SF
- lot size acres
- year built
- zoning
- parking
- construction type
- property class
- assessor improvements

#### 3. Location intelligence
Generate/fetch:
- neighborhood
- corridor / submarket
- anchor tenants
- nearby restaurants
- nearby banks

#### 4. Listing copy generation
Generate:
- sale title
- property description
- neighborhood/location description
- bullet points

### V1 enrichment storage
- write canonical values into the main listing record
- preserve raw source data under `meta.*`
- keep source confidence / provenance if available

---

## Generated Copy Outputs

The system should draft strong listing-ready content automatically.

### Required generated outputs
- `saleTitle`
- `saleDescription`
- `locationDescription`
- `saleBullets[]`

### Recommended future outputs
- `exteriorDescription`
- `leaseDescription`
- `leaseBullets[]`

### Writing standard
Copy should be:
- robust
- plainspoken
- commercial-broker usable
- not obviously AI-sounding
- easy to edit by associates before approval

---

## Review / Approval Workflow

### Broker review page should show
#### Primary editable sections
- core listing facts
- pricing & facts
- photos
- generated property description
- neighborhood/location description
- bullet points
- location intelligence

#### Helper sections
- missing info / warnings
- enrichment-needed summary
- raw/source metadata collapsed

### Broker actions
- save draft
- edit generated content
- upload/remove/reorder photos
- mark listing ready for review

### Admin actions
- view all drafts
- review broker drafts
- edit any field
- approve/publish later

---

## UI Surfaces for V1

### 1. Broker Login
- email/password login
- role-aware access

### 2. Broker Dashboard
- my listings
- status indicators
- create new listing button

### 3. New Listing Intake Form
- lightweight intake
- photo upload
- submit to create draft

### 4. Draft Review Editor
- canonical facts
- generated copy
- photos
- missing info
- mark ready for review

### 5. Admin Dashboard
- all listings
- owner/lead broker
- statuses
- review controls

---

## Minimum V1 Editor Surface

Visible and broker-editable:
- title
- transaction type
- address
- parcel ID
- zoning
- building SF
- lot size acres
- year built
- available SF
- sale price / asking rate
- lease type
- sale title
- property description
- neighborhood/location description
- bullet points
- neighborhood
- corridor
- nearby anchors/restaurants/banks
- photos

Collapsed / mostly hidden:
- raw intake aliases
- source URLs
- navigation traces
- scraper diagnostics
- copy generation metadata
- raw assessor notes
- duplicate upstream fields

---

## Out of Scope for V1

Do not overbuild these yet:
- public self-registration
- full enterprise permissions matrix
- advanced media management / folders / CDN transforms
- full audit/event history UI
- approval comments workflow
- external client portal
- polished publishing workflow beyond simple status handoff

---

## Recommended Implementation Sequence

### Phase 1 — Schema + auth groundwork
- create user model with roles
- add listing ownership fields
- add status model
- move away from shared single-admin login model for real broker access

### Phase 2 — Broker intake form
- build lightweight intake form
- add multi-photo upload
- create draft listing on submit

### Phase 3 — My listings / role-aware dashboards
- broker sees own listings
- admin sees all listings
- display status and ownership

### Phase 4 — Enrichment + draft generation
- run missing-field detection
- run assessor enrichment
- run neighborhood/location enrichment
- generate copy outputs
- store canonical + raw source data

### Phase 5 — Draft review editor
- broker edits canonical fields
- manage photos
- review generated content
- mark ready for review

### Phase 6 — Admin review flow
- admin reviews all drafts
- approve / publish path later

---

## Opinionated Recommendation

Do not treat the current full editor as the primary broker entry point.

Instead:
- intake form first
- enrichment second
- review editor third

That will be faster for associate brokers, cleaner for the system, and more scalable than asking brokers to fill a giant all-fields editor from scratch.

---

## Immediate Next Coding Target

Build **Phase 1 + Phase 2** next:
1. role/user groundwork
2. broker intake form
3. photo upload on intake
4. create draft listing with ownership + status

That is the correct next block for Listing Launch V1 based on the now-validated admin foundation.
