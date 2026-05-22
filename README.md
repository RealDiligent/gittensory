# Gittensory

Gittensory is a backend-only GitHub App/API layer for Gittensor registered repositories.

It gives maintainers and serious contributors advisory signals around repository configuration,
pull requests, issues, bounty context, duplicate risk, and queue health. It does not auto-label,
comment, close, merge, or store user GitHub PATs.

The frontend is intentionally out of scope for this repo slice. Lovable can consume the JSON API
and OpenAPI document once the backend is deployed.

## Backend Stack

- Cloudflare Workers + Hono
- Cloudflare D1 + Drizzle schema/migrations
- Cloudflare Queues for async webhook/check processing
- GitHub App webhooks and check runs
- Zod schemas with generated OpenAPI JSON

## Local Setup

```bash
npm install
npm run cf-typegen
npm run db:migrate:local
npm run dev
```

Secrets are configured through Cloudflare, not committed:

```bash
wrangler secret put GITHUB_WEBHOOK_SECRET
wrangler secret put GITHUB_APP_PRIVATE_KEY
```

For local development, put non-production test values in `.dev.vars`.

## API

- `GET /health`
- `GET /openapi.json`
- `GET /v1/registry/snapshot`
- `GET /v1/repos`
- `GET /v1/repos/:owner/:repo`
- `GET /v1/repos/:owner/:repo/advisory`
- `GET /v1/repos/:owner/:repo/workboard`
- `GET /v1/repos/:owner/:repo/pulls/:number/advisory`
- `GET /v1/repos/:owner/:repo/issues/:number/advisory`
- `POST /v1/github/webhook`
- `POST /v1/internal/jobs/refresh-registry`

## Validation

```bash
npm run validate
```
