# Architecture

Two services. One repo.

```
                                ┌──────────────────────────────────────┐
                                │  Status Page (Railway)              │
                                │                                     │
                                │  React Router 7 + Hono              │
                                │  Drizzle → Railway Postgres         │
                                │                                     │
                                │  Endpoints:                         │
                                │   • UI: / and /admin                │
                                │   • Public API: /api/{components,   │
                                │      incidents}                     │
                                │   • Ingestion: /api/internal/probes │
                                │   • Heartbeat: /api/internal/       │
                                │      heartbeat                      │
                                └──────▲───────▲───────▲──────────────┘
                                       │       │       │  POST (HMAC-signed)
                       ┌───────────────┘       │       └────────────────┐
              ┌────────┴──────┐    ┌───────────┴───────┐    ┌───────────┴──────────┐
              │ Uptime Agent  │    │ Uptime Agent      │    │ Uptime Agent         │
              │ Railway · EU  │    │ Internal · EU     │    │ Internal · Latam     │
              └───────────────┘    └───────────────────┘    └──────────────────────┘
                                          │
                                          ▼ HTTP probes every 60s
                              ┌──────────────────────────────┐
                              │  Components in components.md │
                              └──────────────────────────────┘
```

## Why split

If the probe loop ran inside the Status Page, a Railway-region outage would silence our probes — we'd report "everything is fine" while the world burns, or "everything is down" because we couldn't reach anything. Both are wrong.

Running probes from multiple zones gives us **consensus**: a component is only down when independent agents in different regions agree. A single agent's network blip doesn't open an incident.

## Status Page

Hosts everything user-facing plus the ingestion endpoint:

- **UI** — public homepage (server-rendered list of components + incidents) and `/admin` dashboard
- **Public API** — `GET /api/components`, `GET /api/incidents`, `/feed.atom`
- **Ingestion** — `POST /api/internal/probes` (agents post probe results, HMAC-signed)
- **Heartbeat** — `POST /api/internal/heartbeat` (agents check in every 30s)

Tech: React Router 7 (framework mode, on Vite) for the request handler; Hono as the custom server entry that mounts React Router and exposes the internal endpoints. Drizzle + Railway Postgres for state.

## Uptime Monitor agent

A tiny Node service. No DB, no public ingress, just outbound HTTPS:

1. Boots up with env vars (`STATUS_PAGE_URL`, `AGENT_ID`, `AGENT_REGION`, `AGENT_SHARED_SECRET`)
2. Fetches the component list from `${STATUS_PAGE_URL}/api/internal/components` (cached, refreshed every 5 minutes)
3. Every `PROBE_INTERVAL_SECONDS` (default 60), fires `HTTP GET` against each component's `probe_url` with a 5 s timeout
4. POSTs the batch of results to `${STATUS_PAGE_URL}/api/internal/probes` with an HMAC signature
5. Pings `/api/internal/heartbeat` every 30 s so the Status Page knows it's alive

Multiple instances run in different zones — at minimum: Railway (EU), one internal server (EU), one internal server (Latam). The boss's call: "we can host it easily in several servers, in different zones."

## Data model (Drizzle, on the Status Page)

- **components** — name, slug, probe_url, expected_status, severity_when_down, group_id
- **component_groups** — UI grouping
- **agents** — agent_id (PK, e.g. `railway-eu`), region, last_seen_at, registered_at
- **probes** — (component_id, agent_id, ok, status_code, latency_ms, observed_at) — every result every agent reports
- **incidents** — title, current_status, severity, started_at, resolved_at
- **incident_components** — many-to-many
- **incident_updates** — timeline (incident_id, status, message, posted_at)
- **schedules** — planned maintenance
- **subscribers** — email, confirmed_at, unsubscribe_token, optional component_id

## Consensus logic (Status Page side)

For each component, every probe batch the Status Page recomputes status using a two-stage rule:

**Stage 1 — debounced per-agent vote.** For each agent the Status Page looks at the most recent **2 probes** within a 5-minute lookback. The agent's vote is failing only when *both* are fails (≥ 1 minute of sustained failure). A single transient probe — a CF 5xx, a one-off timeout, a brand-new agent that hasn't probed enough yet — is treated as an "ok" vote here. This is what kills the "EU PoP blip on two agents at once" false-positive class.

**Stage 2 — aggregate across agents.**

| Failing votes (after debounce) | Component status |
|--------------------------------|------------------|
| 0 | Operational |
| 1–2 of ≥ 3 reporting agents | Operational publicly; `[heads-up]` Slack only |
| All reporting agents failing | `severity_when_down` → auto-incident |
| ≥ 3 in ≥ 2 distinct regions, not all | Partial outage → auto-incident |
| ≥ 3 in the same region | Performance issues |
| No probes in the lookback | "Monitoring offline" banner; do not change statuses |

Two safety nets remain for small fleets: the "all reporting agents failing" branch fires even with 1–2 agents reporting, so single-agent setups still flip to severity when their only observer agrees. Recovery is asymmetric — an agent's vote returns to "ok" as soon as a single recent probe succeeds, so a real fix shows on the bar within ~1 probe cycle while detection takes ~2.

A separate first-fail detector emits the Slack `[heads-up]` channel on every agent transition from ok → fail, so the team gets early signal even when the public bar stays green.

When the consensus says a component went from Operational → Partial / Major and there's no open incident for it, we auto-create one in `Investigating`. On recovery we post a `Monitoring` update on the open auto-incident; humans confirm `Resolved`.

### Planned-maintenance detection (agent side)

Harbour.Space services redirect traffic to `https://maintenance.harbour.space/` during planned work. The uptime-monitor agent recognises that landing page (configurable via `MAINTENANCE_HOSTS`) and reports the probe as `ok=true` with `error='maintenance'`. The result: the public bar stays green during planned work and the raw probe row is still distinguishable for forensic queries. Operators should *also* create a Schedule in `/admin/schedules/new` so the public banner shows the maintenance window — auto-detection only prevents the bar from going orange; it does not announce maintenance to users.

## Failure isolation (still the hard constraint)

- Status Page on Railway, agents on Railway + at least 2 internal servers in different regions
- Status Page Postgres is Railway-managed, separate from any harbour.space production DB
- Email through Resend (separate from primary transactional)
- If the Status Page itself goes down: agents keep retrying with backoff; once it returns they catch up. Fall back to Twitter/X for user comms while the page is unreachable.

## Why one process per service (not docker-compose)

Per the boss: each service ships as its own Dockerfile, one process, one image. The Status Page is one container; each Uptime Agent is one container. Production has no docker-compose anywhere — every service is deployable as a standalone container to Railway or any internal Docker host.

## Migration path: out-of-process scheduling

If we ever want to move probe scheduling out of node-cron into Railway Cron Jobs, the agent's design supports it: replace the cron loop with an HTTP-triggered single-pass mode behind a shared secret, and have Railway Cron call it. Not on the roadmap; documented in case.
