# property-portal

PIER's broker/admin property portal built on Next.js.

## Development

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

## Production architecture

- **Portal UI / API:** Vercel-hosted Next.js app
- **Python enrichment:** external Launchpad service, called over HTTP

The portal expects these env vars when external enrichment is enabled:

```bash
LAUNCHPAD_SERVICE_URL=http://127.0.0.1:8787
LAUNCHPAD_SERVICE_TOKEN=replace-with-shared-secret
LAUNCHPAD_SERVICE_TIMEOUT_MS=60000
```

See `docs/launchpad-service-deployment.md` for the Mac Mini service package and deployment steps.
