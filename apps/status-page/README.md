# Status Page (central)

The user-facing app at `https://status.harbour.space`. Hosts the public page, the `/admin` dashboard, the public REST API, the email subscription flow, and the **probe ingestion endpoint** that the [uptime-monitor agents](../uptime-monitor/README.md) post results to.

## Stack

- React Router 7 (Vite, framework mode) + TypeScript + Tailwind
- Hono custom server entry (`server.js`)
- Drizzle ORM + Railway-managed Postgres
- Resend for subscriber emails
- `remix-auth` for `/admin` magic-link login

## Deployment

Single Dockerfile at `apps/status-page/Dockerfile`. Railway picks it up via `apps/status-page/railway.toml`. See `../../docs/deployment.md` for the full setup.

## Database

Schema lives in `app/db/schema.ts`; generated SQL migrations live in `drizzle/`.

```bash
# After editing schema.ts — regenerate SQL + snapshot
npm run db:generate

# Apply pending migrations to the DB at $DATABASE_URL
npm run db:migrate

# Idempotently insert the component groups + components from docs/components.md
npm run db:seed
```

Seed only covers HTTP-probable components. Non-HTTP probes (SMTP TCP, file-storage HEAD) and the third-party-mirror group come in a follow-up once the agent supports specialised probe types.

## Status decision logic

The Status Page is the source of truth for component status. It does **not** probe components itself — that's the [uptime-monitor agents](../uptime-monitor/README.md). The Status Page receives probe results via `POST /api/internal/probes` and computes status from consensus across agents:

| Observed | Component status |
|----------|------------------|
| All agents OK in the last 2 minutes | Operational |
| 1 agent failing, others OK | Performance issues (single-zone network blip) |
| 2+ agents in different regions failing | Partial outage → triggers auto-incident |
| All reporting agents failing | Major outage → triggers auto-incident |
| No reports from any agent in 5 minutes | "Monitoring offline" banner — do not change component statuses |

Multi-agent consensus is what makes this reliable. The Status Page never marks a component down based on a single agent's report.
