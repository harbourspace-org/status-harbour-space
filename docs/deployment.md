# Deployment

Two services to deploy:

1. **Status Page** — single instance on Railway
2. **Uptime Monitor agents** — one Railway instance + N internal Docker hosts in different regions

Each service has its own `Dockerfile` and `railway.toml` under `apps/`. There is no docker-compose anywhere in production.

## Prerequisites

- A Railway account with billing enabled
- DNS control over `harbour.space`
- A Resend account
- Push access to the `harbourspace-org/status-harbour-space` GitHub repo
- SSH access to internal servers in at least two regions (EU + Latam recommended)

---

## Status Page

### 1. Create the Railway project

- New project → "Deploy from GitHub repo" → select `harbourspace-org/status-harbour-space`
- Service settings → **Root Directory**: `apps/status-page`
- Railway picks up `apps/status-page/railway.toml` (Dockerfile build, `/api/health` healthcheck)
- Pick `main` branch as the production environment
- Create a `staging` environment from the same repo, pointed at any feature branch

### 2. Add Postgres

- Project → **+ New** → **Database** → **PostgreSQL**
- `DATABASE_URL` auto-injected to the Status Page service
- Enable backups: daily, retention 30 days

### 3. Set Status Page environment variables

In the Status Page service → **Variables**:

| Variable | Value |
|----------|-------|
| `APP_URL` | `https://status.harbour.space` |
| `AUTH_SECRET` | `openssl rand -base64 32` |
| `ADMIN_EMAILS` | comma-separated list of on-call engineer emails |
| `RESEND_API_KEY` | from the Resend dashboard |
| `MAIL_FROM_ADDRESS` | `status@harbour.space` |
| `MAIL_FROM_NAME` | `"Harbour.Space Status"` |
| `AGENT_SHARED_SECRET` | `openssl rand -base64 32` — share with agents |
| `WEBHOOK_SHARED_SECRET` | random string |
| `SLACK_WEBHOOK_URL` | (optional) |
| `TELEGRAM_BOT_TOKEN` / `TELEGRAM_CHAT_ID` | (optional) |

`DATABASE_URL` is set automatically; do not override.

### 4. Custom domain

- Service → **Settings** → **Domains** → add `status.harbour.space` (and `status-staging.harbour.space` for staging)
- Railway returns a CNAME target — add it in your DNS provider (Cloudflare proxy on)
- TLS is provisioned automatically once DNS resolves

### 5. First deploy

Push to `main`. Railway runs:

1. `docker build -f apps/status-page/Dockerfile .` (with build context = `apps/status-page/`)
2. `node server.js` (custom Hono entry that mounts React Router and starts heartbeat tracking)

The healthcheck at `/api/health` must return 200 within 30 seconds.

### 6. First admin user

The first time someone whose email is in `ADMIN_EMAILS` signs in via the magic-link flow, they get the admin role. No seeding needed.

---

## Uptime Monitor agents

### 1. Railway-hosted agent (EU)

- Same Railway project, **+ New** → **Service** → **Empty Service**, then connect to the GitHub repo
- Service settings → **Root Directory**: `apps/uptime-monitor`
- Picks up `apps/uptime-monitor/railway.toml`
- Set env vars (see below)
- Pick a Railway region in the EU

Required env vars on the Railway agent:

| Variable | Value |
|----------|-------|
| `STATUS_PAGE_URL` | `https://status.harbour.space` |
| `AGENT_ID` | `railway-eu` |
| `AGENT_REGION` | `eu` |
| `AGENT_SHARED_SECRET` | the value you set on the Status Page |

### 2. Internal-server agents

Build the image once (same Dockerfile) and `docker run` it on each internal host. Example for an EU host:

```bash
# On the internal host, cloned the repo
docker build -t harbour-uptime-monitor -f apps/uptime-monitor/Dockerfile apps/uptime-monitor/

docker run -d --restart unless-stopped \
  --name harbour-uptime-monitor \
  -e STATUS_PAGE_URL=https://status.harbour.space \
  -e AGENT_ID=internal-eu-1 \
  -e AGENT_REGION=eu \
  -e AGENT_SHARED_SECRET=<the secret> \
  harbour-uptime-monitor
```

Each agent must have a unique `AGENT_ID`. The Status Page registers agents on first heartbeat.

### 3. Verify the agent is reporting

After ~30 seconds, in the Status Page admin → **Agents** tab:

- Agent shows `last_seen_at` within the last 60 seconds
- Probe results from this agent appear in the per-component history

If an agent goes silent for `AGENT_STALE_AFTER_SECONDS` (default 300), the public page shows a "Monitoring offline" banner — but does **not** start marking components down.

---

## Routine operations

### Backups

Railway's managed Postgres backups are a paid-plan feature, so we run our own with `pg_dump` from GitHub Actions:

- Workflow: [`.github/workflows/postgres-backup.yml`](../.github/workflows/postgres-backup.yml)
- Schedule: daily at 03:00 UTC
- Retention: 30 days (Actions artifact retention)
- Required repo secret: `PROD_DATABASE_PUBLIC_URL` (copy from Railway → Postgres → Variables → `DATABASE_PUBLIC_URL`)

**Manual snapshot** (before any schema-changing deploy):

- GitHub → Actions → "Postgres backup" → **Run workflow**

**Restore** (download the `.dump` artifact from the workflow run, then):

```bash
pg_restore --clean --if-exists --no-owner --no-privileges \
  -d "$TARGET_DATABASE_URL" backup-YYYYMMDDTHHMMSSZ.dump
```

For a non-destructive verify-restore, point `$TARGET_DATABASE_URL` at a fresh staging or local Postgres rather than production.

### Updates

Push to `main` → Railway auto-deploys both Railway services (Status Page + Railway agent). Internal agents need a `git pull && docker build && docker stop && docker run …` (or wire that to a deploy script).

### Logs

- Status Page: `railway logs --service status-page`
- Railway agent: `railway logs --service uptime-monitor`
- Internal agent: `docker logs -f harbour-uptime-monitor`

---

## Local dev (no compose)

```bash
# Postgres
docker run --name status-pg -e POSTGRES_PASSWORD=dev -p 5432:5432 -d postgres:16-alpine

# Status Page
cd apps/status-page
cp .env.example .env
# fill in DATABASE_URL=postgres://postgres:dev@localhost:5432/postgres and AUTH_SECRET
npm install
npm run db:migrate
npm run dev    # http://localhost:3000

# (optional) Uptime agent against local Status Page
cd ../uptime-monitor
cp .env.example .env
# fill in STATUS_PAGE_URL=http://localhost:3000, AGENT_ID=local-dev, AGENT_REGION=local
npm install
npm run dev
```

## Rollback

Railway keeps every previous deploy. Service → **Deployments** → pick a previous deploy → **Redeploy**.

For schema-incompatible rollbacks: restore the Postgres snapshot taken before the deploy, then redeploy the older image.

## Staging

`status-staging.harbour.space` runs the same Status Page service from a different branch (typically `staging`). It uses a separate Postgres instance — staging data is throwaway. The Railway-hosted agent is not duplicated for staging; one agent reporting from EU is enough to exercise the ingestion flow.
