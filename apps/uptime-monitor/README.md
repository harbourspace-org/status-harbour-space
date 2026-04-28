# Uptime Monitor agent

A lightweight Node service that probes Harbour.Space components on a schedule and reports results back to the central Status Page.

## Why a separate service

The Status Page lives on Railway. If we ran the probe loop in the same process, a Railway-region outage would silence our probes — so we'd report "everything is down" when in reality our own monitoring is the thing that's down.

We run multiple instances of this agent across different zones (Railway EU + internal servers in EU + Latam). The Status Page only marks a component down when **multiple agents in different zones** agree.

## What it does

Every `PROBE_INTERVAL_SECONDS` (default 60):

1. Fetch the current component list from `${STATUS_PAGE_URL}/api/internal/components` (cached, refreshed every 5 minutes)
2. For each component, fire `HTTP GET` against `probe_url` with a 5 s timeout
3. Build a payload `{ agent_id, agent_region, observed_at, results: [...] }`
4. HMAC-sign it with `AGENT_SHARED_SECRET`
5. `POST` to `${STATUS_PAGE_URL}/api/internal/probes`

The agent also pings `${STATUS_PAGE_URL}/api/internal/heartbeat` every 30 s so the Status Page can show which agents are alive.

## Environment variables

| Variable | Required | Description |
|----------|----------|-------------|
| `STATUS_PAGE_URL` | yes | e.g. `https://status.harbour.space` |
| `AGENT_ID` | yes | unique per agent; e.g. `railway-eu`, `internal-eu-1`, `internal-latam-1` |
| `AGENT_REGION` | yes | e.g. `eu`, `latam`, `us-east` — used by the consensus logic on the Status Page |
| `AGENT_SHARED_SECRET` | yes | HMAC secret; same value as the Status Page's `AGENT_SHARED_SECRET` |
| `PROBE_INTERVAL_SECONDS` | no, default 60 | how often to probe |
| `PROBE_TIMEOUT_MS` | no, default 5000 | per-probe HTTP timeout |

## Deployment

### Railway (one EU instance)

The Railway service uses `apps/uptime-monitor/railway.toml` and `apps/uptime-monitor/Dockerfile`. Set the env vars above in the Railway dashboard.

### Internal servers

Same Dockerfile, just `docker run`:

```bash
docker build -t harbour-uptime-monitor -f apps/uptime-monitor/Dockerfile .
docker run -d --restart unless-stopped \
  --name harbour-uptime-monitor \
  -e STATUS_PAGE_URL=https://status.harbour.space \
  -e AGENT_ID=internal-eu-1 \
  -e AGENT_REGION=eu \
  -e AGENT_SHARED_SECRET=... \
  harbour-uptime-monitor
```

## What this is *not*

- Not a public service — it has no inbound HTTP. It only makes outbound requests.
- Not stateful — it has no DB. Component list is fetched from the Status Page; results are pushed and forgotten locally.
- Not authoritative — it reports observations. The Status Page decides when to open an incident based on consensus across agents.
