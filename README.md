# status.harbour.space

Public status page for Harbour.Space services. The app probes every component on a schedule, records uptime + incidents, and exposes a public page with subscribe-to-updates.

Production URL: **https://status.harbour.space** (pending DNS)

---

## Stack

| Layer | Choice | Why |
|-------|--------|-----|
| Language | **TypeScript** | Boss preference; one language end-to-end |
| Framework | **Next.js 15** (App Router) | Single codebase for UI + API routes + cron, server components, Railway has first-class support |
| ORM | **Drizzle** | Lightweight, SQL-first, great TypeScript types |
| Database | **Postgres** | Managed by Railway |
| Email | **Resend** | Simple API, good deliverability, separate from our primary sender (failure isolation) |
| Hosting | **Railway** | Boss preference; single Dockerfile deploy + managed Postgres |
| Container | **Single Dockerfile** | One process, one image — no docker-compose in production |

## What this gives users

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

Full mapping with severities, owners, and probe URLs lives in [`docs/components.md`](docs/components.md). The probe loop runs inside the same Next.js process, hitting each component every 60 seconds and recording the response.

---

## Architecture

```
                ┌──────────────────────┐
                │  status.harbour.space│  ← public visitors
                └─────────┬────────────┘
                          │ HTTPS
                ┌─────────▼────────────┐
                │   Railway edge       │  TLS, custom domain
                └─────────┬────────────┘
                          │
                ┌─────────▼────────────┐
                │  Next.js 15 (single  │  ← single Dockerfile
                │  container)          │
                │  ┌──────────────┐    │
                │  │ UI + API     │    │
                │  │ + probe cron │    │
                │  └──────────────┘    │
                └──────────┬───────────┘
                           │
                  ┌────────▼─────────┐
                  │ Railway Postgres │  ← components, incidents,
                  │                  │    probes, subscribers
                  └──────────────────┘
                           ▲
                           │ HTTP probes every 60s
                           │
                ┌──────────┴──────────┐
                │ harbour.space + the │  ← target services
                │ subdomains in       │
                │ docs/components.md  │
                └─────────────────────┘
```

Details in [`docs/architecture.md`](docs/architecture.md).

---

## Local development

You need Node 20+ and a local Postgres. The two-line setup:

```bash
# 1. Run a throwaway Postgres locally
docker run --name status-pg -e POSTGRES_PASSWORD=dev -p 5432:5432 -d postgres:16-alpine

# 2. Run the app
cp .env.example .env
# fill in DATABASE_URL=postgres://postgres:dev@localhost:5432/postgres and AUTH_SECRET
npm install
npm run db:migrate
npm run dev
```

App at http://localhost:3000. Admin at /admin (sign in with one of the emails listed in `ADMIN_EMAILS`).

We do **not** ship a `docker-compose.yml`. The application is one container — local dev runs Node directly, with Postgres as a side-process.

## Deployment (Railway)

```bash
railway link                 # connect to the Railway project
railway up                   # build & deploy from this branch
```

Push to `main` auto-deploys. Full setup in [`docs/deployment.md`](docs/deployment.md).

---

## Incident response

When something breaks, follow [`docs/incident-runbook.md`](docs/incident-runbook.md). TL;DR:

1. Open an incident in `/admin` **before** debugging
2. Set the affected component to the right status
3. Post updates every 30 minutes minimum
4. Resolve and write a brief post-mortem in the final update

## Project tracking

Implementation issues are tracked in Linear under the **Status Page (status.harbour.space)** project on the HS Dev Team. The roadmap is split into 5 phases (HSDEV-611 through HSDEV-615).

## License

MIT — see [LICENSE](LICENSE).
