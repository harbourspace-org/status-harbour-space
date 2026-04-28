# status.harbour.space

Public status page for Harbour.Space services. Two services in this repo:

| Service | Where it runs | What it does |
|---------|---------------|--------------|
| [`apps/status-page`](apps/status-page/) | Railway (one instance) | Public page, `/admin`, REST API, ingests probe results |
| [`apps/uptime-monitor`](apps/uptime-monitor/) | Railway (EU) + internal servers (multiple regions) | Probes harbour.space components and posts results to the Status Page |

Production URL: **https://status.harbour.space** (pending DNS)

The split into two services is deliberate — see [`docs/architecture.md`](docs/architecture.md) for why.

---

## Stack

| Layer | Choice | Why |
|-------|--------|-----|
| Language | **TypeScript** | One language end-to-end |
| Status Page framework | **React Router 7** (Vite, framework mode) + **Hono** | Vite build + SSR + loaders/actions in a single Node process |
| Uptime monitor | **Plain Node + node-cron** | Tiny — just a probe loop and an HTTPS POST |
| ORM | **Drizzle** | Lightweight, SQL-first |
| Database | **Postgres** | Managed by Railway (Status Page only) |
| Email | **Resend** | Independent of our primary transactional sender (failure isolation) |
| Hosting | **Railway** + **internal servers** | Status Page on Railway; uptime monitor instances spread across zones |
| Container | **One Dockerfile per service** | No docker-compose anywhere in production |

## What the public page gives users

- Real-time status of every Harbour.Space service (Operational / Degraded / Partial Outage / Major Outage / Maintenance)
- 90-day uptime history per component
- Incident timeline with status progression (Investigating → Identified → Monitoring → Resolved)
- Scheduled maintenance announcements
- Public subscriptions: email, Slack, webhook, Atom/RSS
- Public REST API: `GET /api/components`, `GET /api/incidents`
- Multi-language UI (English + Spanish)

## Components monitored (initial set)

| Component | URL / Service |
|-----------|---------------|
| Marketing website | harbour.space |
| Student Space | student.harbour.space |
| LMS | lms.harbour.space |
| Admissions portal | apply.harbour.space |
| Authentication / SSO | auth.harbour.space |
| Email delivery | SMTP infrastructure |
| Visual Regression Service | qa.harbour.space |
| Internal API gateway | api.harbour.space |

Full mapping with severities, owners, and probe URLs lives in [`docs/components.md`](docs/components.md).

---

## High-level architecture

```
                                ┌──────────────────────────────────────┐
                                │  status.harbour.space (Status Page) │
                                │  on Railway                         │
                                │                                     │
                                │  React Router 7 + Hono              │
                                │  Drizzle → Railway Postgres         │
                                │                                     │
                                │  Endpoints:                         │
                                │   • UI: / and /admin                │
                                │   • Public API: /api/{components,   │
                                │      incidents}                     │
                                │   • Ingestion: /api/internal/probes │
                                └──────▲───────▲───────▲──────────────┘
                                       │       │       │  POST results
                                       │       │       │  (HMAC-signed)
                       ┌───────────────┘       │       └────────────────┐
                       │                       │                        │
              ┌────────┴──────┐    ┌───────────┴───────┐    ┌───────────┴──────────┐
              │ Uptime Agent  │    │ Uptime Agent      │    │ Uptime Agent         │
              │ Railway · EU  │    │ Internal · EU     │    │ Internal · Latam     │
              │               │    │                   │    │                      │
              │ probes every  │    │ probes every 60s  │    │ probes every 60s     │
              │ 60s           │    │                   │    │                      │
              └───────┬───────┘    └─────────┬─────────┘    └──────────┬───────────┘
                      │                      │                         │
                      └──────────────────────┼─────────────────────────┘
                                             ▼
                              ┌──────────────────────────────┐
                              │  Probe targets:              │
                              │   harbour.space, student.*,  │
                              │   lms.*, apply.*, auth.*, …  │
                              └──────────────────────────────┘
```

Each agent is a separate `docker run`, behind no public ingress, just outbound HTTPS. Status Page only marks a component down when **multiple agents in different regions** report failure — single-agent network blips don't trigger false alarms.

Full diagram, data model, and consensus logic in [`docs/architecture.md`](docs/architecture.md). Agent-specific design in [`docs/uptime-monitor.md`](docs/uptime-monitor.md).

---

## Local development

You only need the Status Page running for most work. The agent is straightforward and can be tested against a local Status Page.

```bash
# 1. Postgres locally
docker run --name status-pg -e POSTGRES_PASSWORD=dev -p 5432:5432 -d postgres:16-alpine

# 2. Status Page
cd apps/status-page
cp .env.example .env
# fill in DATABASE_URL=postgres://postgres:dev@localhost:5432/postgres and AUTH_SECRET
npm install
npm run db:migrate
npm run dev      # http://localhost:3000

# 3. (optional) Uptime agent pointed at local Status Page
cd apps/uptime-monitor
cp .env.example .env
# fill in STATUS_PAGE_URL=http://localhost:3000, AGENT_ID=local-dev, etc.
npm install
npm run dev
```

There is no `docker-compose.yml` — by design. Each service is one container.

## Deployment

See [`docs/deployment.md`](docs/deployment.md). Two services, two Railway services + N internal Docker hosts for the uptime monitor.

## Incident response

When something breaks, follow [`docs/incident-runbook.md`](docs/incident-runbook.md).

## Project tracking

Linear project: **Status Page (status.harbour.space)** on the HS Dev Team. Five phases, HSDEV-611 through HSDEV-615.

## License

MIT — see [LICENSE](LICENSE).
