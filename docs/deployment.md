# Deployment

The app is deployed to **Railway** as a single container, built from the repo's `Dockerfile`. There is no docker-compose anywhere in the production path.

## Prerequisites

- A Railway account with billing enabled
- DNS control over `harbour.space`
- A Resend account (or another transactional email provider)
- Push access to the `harbourspace-org/status-harbour-space` GitHub repo

## First-time setup

### 1. Create the Railway project

- New project → "Deploy from GitHub repo" → select `harbourspace-org/status-harbour-space`
- Railway detects the `Dockerfile` (build setting in `railway.toml`)
- Pick the `main` branch as the production environment
- Create a second environment called `staging` from the same repo, pointed at any feature branch

### 2. Add Postgres

- Inside the project → **+ New** → **Database** → **PostgreSQL**
- Railway auto-injects `DATABASE_URL` into the app service — no extra config needed
- Enable "Backups" in the Postgres service settings (daily, 7-day retention by default)

### 3. Set environment variables

In the app service → **Variables** tab, set:

| Variable | Value |
|----------|-------|
| `APP_URL` | `https://status.harbour.space` (production) / `https://status-staging.harbour.space` (staging) |
| `AUTH_SECRET` | `openssl rand -base64 32` |
| `ADMIN_EMAILS` | comma-separated list of on-call engineer emails |
| `RESEND_API_KEY` | from the Resend dashboard |
| `MAIL_FROM_ADDRESS` | `status@harbour.space` |
| `MAIL_FROM_NAME` | `"Harbour.Space Status"` |
| `SLACK_WEBHOOK_URL` | (optional) |
| `TELEGRAM_BOT_TOKEN` / `TELEGRAM_CHAT_ID` | (optional) |
| `WEBHOOK_SHARED_SECRET` | random string — protects `/api/webhooks/incident` |

`DATABASE_URL` is set automatically when Postgres is linked. Do not override.

### 4. Custom domain

- App service → **Settings** → **Domains** → **Custom domain**
- Add `status.harbour.space` (production) and `status-staging.harbour.space` (staging)
- Railway shows a CNAME target — add it in your DNS provider, proxied through Cloudflare if you want
- Railway provisions TLS automatically once DNS resolves (no certbot, no nginx config)

### 5. First deploy

Push to `main`. Railway picks it up and runs:

1. `docker build -f Dockerfile .`
2. `node server.js` (the custom Hono entry that mounts React Router and starts the probe cron)

The healthcheck at `/api/health` must return 200 within 30 seconds for Railway to mark the deploy live.

### 6. First admin user

The app does not seed users. The first time someone whose email is in `ADMIN_EMAILS` signs in via the magic-link flow, they get the admin role.

## Routine operations

### Backups

Railway-managed Postgres takes daily backups. Restore from the Postgres service → **Backups** tab. Snapshot the DB manually before any schema-changing deploy:

- Postgres service → **Data** → **Snapshot now**

Retention: 7 days by default; bump to 30 in Settings if needed.

### Updates

Push to `main` → auto-deploy. For larger changes, push to a feature branch and let it deploy to staging first.

```
git checkout -b feat/whatever
# ... commits ...
git push
# open PR; staging environment auto-deploys this branch
```

### Logs and metrics

- Railway dashboard → app service → **Logs** (live tail)
- Metrics tab → CPU, memory, network
- For deeper debugging, use `railway logs --service status-harbour-space`

## Local dev (no compose)

```bash
# Postgres locally (one-off container)
docker run --name status-pg -e POSTGRES_PASSWORD=dev -p 5432:5432 -d postgres:16-alpine

# App
cp .env.example .env
# fill in DATABASE_URL=postgres://postgres:dev@localhost:5432/postgres and AUTH_SECRET
npm install
npm run db:migrate
npm run dev
```

`npm run dev` starts Vite (HMR) + the Hono server. The probe loop boots automatically and hits whatever `probe_url`s you have in the DB. Seed sensible test components via `npm run db:seed`.

## Rollback

Railway keeps every previous deploy. To roll back:

- App service → **Deployments** tab → pick a previous deploy → **Redeploy**

For schema-incompatible rollbacks: restore the Postgres snapshot taken before the deploy, then redeploy the older image.

## Staging

`status-staging.harbour.space` runs the same app from a different branch (typically `staging` or whatever PR is open). It uses a separate Postgres instance — staging data is throwaway.
