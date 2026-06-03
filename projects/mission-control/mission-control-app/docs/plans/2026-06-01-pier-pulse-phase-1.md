# PIER Pulse Drop Phase 1 MVP Draft Generator Implementation Plan

> **For Hermes:** Use subagent-driven-development skill if this grows beyond direct implementation. Current milestone gating: stop for Ryan only at 33%, 66%, and 100% complete.

**Goal:** Build a draft-first PIER Pulse Drop / Market Intel automation that collects/source-packs market stories, uses local Qwen/Ollama for bounded extraction/triage, uses Gemini/ChatGPT for final writing, and prepares WordPress draft payloads for Ryan review.

**Architecture:** Phase 1 is a deterministic Mission Control module plus a runnable automation script. The first third builds pure, tested primitives: corridor rotation, source candidate normalization/scoring, source-pack assembly, PIER editorial prompt scaffolding, and WordPress draft payload creation. Later thirds wire live RSS/web collection, local Ollama Qwen extraction, cloud LLM writing, WordPress REST draft creation, Mission Control logging, and cron scheduling.

**Tech Stack:** Next.js 16 Mission Control app, TypeScript pure modules/tests (`tsx --test`), Node/Python automation as needed, local Ollama/Qwen for bounded extraction, Gemini/ChatGPT for final article writing, WordPress REST API draft creation.

---

## Phase 1 Completion Gates

### 33% Gate — Foundation complete
- Create tested `src/lib/pier-pulse.ts` primitives.
- Preserve Ryan's Coastal Georgia corridor rotation.
- Define source-pack JSON shape and scoring/filtering rules.
- Define PIER writer prompt with CCIM-level, professional CRE positioning.
- Define WordPress draft payload defaults: category 99, fallback featured media 20240, tags [126,127,128,129,130], status draft.
- No external publishing calls yet.

### 66% Gate — Local automation runnable
- Add collector/extractor runner stub or script that can consume fixture/live RSS inputs.
- Add Ollama/Qwen bounded extraction interface with graceful fallback when Ollama is unavailable.
- Add cloud-writer interface stub/config without hardcoding secrets.
- Write run artifacts into Mission Control data/artifacts and activity log.
- Provide dry-run command.

### 100% Gate — MVP integrated
- Add WordPress REST draft creation client in draft-only mode.
- Add Mission Control API/view entry point or workflow registration.
- Add cron-ready command/prompt, disabled until Ryan authorizes scheduling.
- Verify tests/build/dry-run.
- Report exact files, commands, env variables, and next manual credentials needed.

---

## Task 1: Foundation tests and pure module

**Objective:** Establish deterministic core behavior before any live scraping or external calls.

**Files:**
- Create: `tests/pier-pulse.test.ts`
- Create: `src/lib/pier-pulse.ts`

**TDD Steps:**
1. Write failing tests for corridor rotation, source-pack filtering, writer prompt content, and WordPress draft defaults.
2. Run `npm test -- --test-name-pattern='PIER Pulse'` and confirm failure due to missing module.
3. Implement minimal module.
4. Run focused and full tests.

## Task 2: Runner and provider boundaries

**Objective:** Add a dry-run automation boundary that can later call RSS, Ollama, cloud LLM, and WordPress without secrets in code.

**Files:**
- Create/Modify after Task 1: `src/lib/pier-pulse-runner.ts`, optional `scripts/pier-pulse-dry-run.ts`
- Tests: `tests/pier-pulse-runner.test.ts`

## Task 3: Mission Control integration

**Objective:** Surface Phase 1 output inside Mission Control and persist activity events/artifacts.

**Files:**
- Modify: store/types only as needed; prefer separate JSON artifact files to avoid destabilizing current store schema.
- Optional route: `src/app/api/pier-pulse/route.ts`

## Task 4: WordPress draft-only publisher

**Objective:** Create drafts only, never publish, and never hardcode credentials.

**Files:**
- Create: `src/lib/pier-pulse-wordpress.ts`
- Tests: `tests/pier-pulse-wordpress.test.ts`

## Verification

- `npm test`
- `npm run lint`
- `npm run build` if time permits after integration work
- Dry-run creates local artifact but no public post unless WP env credentials are intentionally configured.
