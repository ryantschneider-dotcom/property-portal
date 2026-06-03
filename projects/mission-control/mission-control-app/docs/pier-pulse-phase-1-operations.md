# PIER Pulse Drop Phase 1 Operations

## Status

Phase 1 MVP is draft-first and safe-by-default:

- Local source-pack/draft artifact generation is enabled.
- WordPress creation is draft-only and requires explicit `--create-wp-draft` or API `createWordPressDraft: true`.
- No public publish path exists in Phase 1.
- Cron scheduling is documented but intentionally not enabled until Ryan authorizes it.

## Commands

Dry run with fixture sources:

```bash
npm run pier-pulse:dry-run
```

Dry run for a specific corridor index:

```bash
npm run pier-pulse:dry-run -- --run-index 1
```

Use local Ollama/Qwen for bounded source extraction:

```bash
PIER_PULSE_USE_OLLAMA=true npm run pier-pulse:dry-run
```

Use Gemini/OpenAI cloud writer if credentials are configured:

```bash
PIER_PULSE_USE_CLOUD_WRITER=true npm run pier-pulse:dry-run
```

Create a WordPress draft only after credentials are configured:

```bash
PIER_PULSE_USE_CLOUD_WRITER=true npm run pier-pulse:dry-run -- --create-wp-draft true
```

## Mission Control API

Status:

```bash
curl http://localhost:3000/api/pier-pulse
```

Generate local artifact only:

```bash
curl -X POST http://localhost:3000/api/pier-pulse \
  -H 'content-type: application/json' \
  -d '{"runIndex":0}'
```

Generate with Ollama + cloud writer, still local artifact only:

```bash
curl -X POST http://localhost:3000/api/pier-pulse \
  -H 'content-type: application/json' \
  -d '{"runIndex":0,"useOllama":true,"useCloudWriter":true}'
```

Create WordPress draft only:

```bash
curl -X POST http://localhost:3000/api/pier-pulse \
  -H 'content-type: application/json' \
  -d '{"runIndex":0,"useOllama":true,"useCloudWriter":true,"createWordPressDraft":true}'
```

## Environment Variables

WordPress:

```bash
PIER_PULSE_WP_BASE_URL=https://piercommercial.com
PIER_PULSE_WP_USERNAME=<wordpress-application-username>
PIER_PULSE_WP_APP_PASSWORD=<wordpress-application-password>
```

Ollama/Qwen:

```bash
PIER_PULSE_OLLAMA_URL=http://127.0.0.1:11434
PIER_PULSE_OLLAMA_MODEL=qwen2.5-coder:3b-mack-safe
PIER_PULSE_USE_OLLAMA=true
```

Cloud writer:

```bash
GEMINI_API_KEY=<gemini-key>
# or
GOOGLE_API_KEY=<gemini-key>
# or
OPENAI_API_KEY=<openai-key>
PIER_PULSE_USE_CLOUD_WRITER=true
```

## Phase 2/3 editorial + image output

Phase 2/3 enriches every draft with the locked PIER Pulse house structure and a reviewable image plan.

Writer output now carries:

- `heroImagePrompt`: one premium hero visual prompt for the article.
- `middleImagePrompts`: exactly 3 supporting in-body visual prompts.
- Enriched HTML structure: short opening, `The Signal`, scannable sections, `THE BOTTOM LINE`, and the locked PIER contact close: three story-specific strategy lines, `Contact PIER Commercial Real Estate today.`, `Phone: 912.353.7707 | Website: piercommercial.com | Instagram: @piercommercial`, and linked `Contact Us` CTA to `/contact-us/`.

CLI/API summaries surface the image prompts directly. The full artifact also preserves them under `writerOutput`.

WordPress draft payloads include image prompts in an editor-safe HTML comment before the Source Pack:

```html
<!-- PIER Pulse Image Prompts
Hero: ...
Middle 1: ...
Middle 2: ...
Middle 3: ...
-->
```

This keeps visual direction available during draft review without adding public-facing `Credits` or `References` sections.

## Phase 4 live collectors + social drafts

Phase 4 adds optional live data collection and review-only social copy while keeping the entire workflow draft-first.

Live collector config:

- Default config: `data/pier-pulse/live-sources.json`.
- Script: `scripts/pier-pulse-live-collector.py`.
- Config root may be a single collector object or `{ "collectors": [...] }`.
- Each collector should include `collectorId`, `corridor`, `corridorHint`, and `sources`.
- Source types currently supported: `rss`, `atom`, and `agenda_html`.
- RSS/Atom and agenda sources may use `includeTerms` / `excludeTerms` to keep non-CRE news out of the Source Pack.
- The TypeScript runner filters collectors to the active `--run-index` corridor before invoking Python.

Live collector dry run:

```bash
PIER_PULSE_OLLAMA_TIMEOUT_MS=20000 npm run pier-pulse:dry-run -- \
  --run-index 0 \
  --live-collectors true \
  --ollama true \
  --social-drafts true
```

Social draft contract:

- Social drafts are generated only as review assets; no social platform publishing is wired.
- Cloud social writer returns JSON with optional `linkedin`, `facebook`, and `instagram` objects.
- Each platform object contains `copy` and `hashtags`.
- `normalizeSocialDraftSet(...)` enforces platform limits and falls back to safe PIER-branded drafts if the cloud writer is unavailable.
- WordPress payload stores social drafts only in hidden backend metadata: `<!-- PIER Pulse Social Drafts ... -->` and `meta.pier_pulse_social_drafts`.

CLI flags / API body fields:

- CLI: `--live-collectors true`, `--collector-config <path>`, `--social-drafts true|false`, `--article-url <url>`.
- API: `useLiveCollectors`, `liveCollectorConfigPath`, `useSocialDrafts`, `articleUrl`.
- Env fallbacks: `PIER_PULSE_USE_LIVE_COLLECTORS`, `PIER_PULSE_LIVE_COLLECTOR_CONFIG`, `PIER_PULSE_USE_SOCIAL_DRAFTS`, `PIER_PULSE_ARTICLE_URL`, `PIER_PULSE_PYTHON_BIN`, `PIER_PULSE_LIVE_COLLECTOR_TIMEOUT_MS`, `PIER_PULSE_OLLAMA_TIMEOUT_MS`.

## Phase 5 deeper CRE intelligence + lead capture

Phase 5 expands the deterministic and LLM-assisted signal taxonomy beyond generic CRE stories.

First-class intelligence topics:

- `sublease`: sublease availability, available space, sublet signals.
- `rent`: asking rent, lease rate, rent movement, pricing pressure.
- `permit`: building permits, commercial permits, approvals, applications.
- `project`: site plans, project announcements, construction delivery.
- `event`: groundbreaking, ribbon cutting, grand opening, tenant announcement.
- `agenda`: city council, county commission, planning commission, board agenda.
- `zoning`: zoning, rezoning, hearings, land-use review.
- `infrastructure`: roads, utilities, sewer/water, interchange, infrastructure approvals.

Writer/social behavior:

- Qwen/Ollama extraction prompt now asks for the Phase 5 taxonomy explicitly while keeping the JSON envelope unchanged.
- Gemini/OpenAI writer prompt tells the article writer to surface these intelligence signals only when supported by the Source Pack.
- If Gemini is configured but unavailable, the cloud writer falls through to OpenAI when `OPENAI_API_KEY` is present.
- `THE BOTTOM LINE` strategy lines now steer toward PIER market analytics, off-market opportunities, and site selection consulting without hype.
- Social drafts are still review-only, but each platform copy is normalized to include a non-salesy lead-capture CTA tied to market analytics, off-market opportunities, or site selection guidance.

Full Phase 5 artifact-only live verification:

```bash
set -a; source .env; set +a
PIER_PULSE_OLLAMA_TIMEOUT_MS=5000 npm run pier-pulse:dry-run -- \
  --run-index 0 \
  --live-collectors true \
  --ollama true \
  --cloud-writer true \
  --social-drafts true \
  --artifacts-dir data/pier-pulse/artifacts
```

Verification expectations:

- Artifact `published` remains `false`.
- WordPress payload `status` remains `draft`.
- No WordPress draft is created unless `--create-wp-draft true` is explicitly passed.
- `providerModes.writer` may be `cloud`; inspect title/body to ensure it is not `Cloud Writer Unavailable`.
- Social drafts are present and include lead-capture language across platforms.

## Cron-ready schedule

When Ryan authorizes scheduling, use Hermes cron with a self-contained prompt or script. Recommended first schedule:

```text
0 8 * * 1,3,5
```

Meaning: Monday / Wednesday / Friday at 8:00 AM local machine time.

Initial cron should run artifact generation only, not WordPress draft creation:

```bash
cd /Users/macclaw/projects/mission-control/mission-control-app && npm run pier-pulse:dry-run -- --run-index "$PIER_PULSE_RUN_INDEX"
```

Then, after Ryan confirms quality, enable `PIER_PULSE_USE_CLOUD_WRITER=true` and finally explicit draft creation.
