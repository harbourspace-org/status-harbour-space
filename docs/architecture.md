# Architecture

## High-level

```
Internet ──► Railway edge (TLS, custom domain) ──► Next.js container
                                                        │
                                  ┌─────────────────────┼─────────────────────┐
                                  │                     │                     │
                            UI / pages          API routes              Probe scheduler
                          (server components)   (REST + webhooks)     (node-cron, in-process)
                                  │                     │                     │
                                  └──────────┬──────────┘                     │
                                             │                                │
                                  ┌──────────▼──────────┐                     │
                                  │  Drizzle ORM        │◄────────────────────┘
                                  └──────────┬──────────┘
                                             │
                                  ┌──────────▼──────────┐
                                  │  Railway Postgres   │
                                  └─────────────────────┘
```

Single Dockerfile. Single Node process. UI, API, and the probe loop all run in the same container — fewer moving parts than docker-compose, and the boss explicitly asked for this shape.

## Why Next.js

- One codebase for UI + API routes (no separate frontend / backend repos)
- App Router gives us server components for the public page (no client-side JS for the bits that just render data)
- Standalone output mode → small Docker image, fast cold start
- Railway has first-class support
- Easy to layer on i18n (next-intl) and auth (Auth.js) without leaving the framework

## Why not Cachet / a self-hosted PHP option

The earlier scaffold pointed at Cachet. The boss asked us to switch to TypeScript and ship as a single container on Railway, so Cachet is gone. The behaviour we need (component statuses, incidents, scheduled maintenance, subscriptions, RSS) is straightforward to implement directly.

## Data model (Drizzle)

- **components** — one row per service (name, slug, probe URL, expected status, severity-when-down, group_id)
- **component_groups** — UI grouping (e.g. "Student-facing", "Internal", "Email & Notifications")
- **incidents** — title, current status (Investigating / Identified / Monitoring / Resolved), severity, started_at, resolved_at
- **incident_components** — many-to-many between incidents and components
- **incident_updates** — timeline entries (incident_id, status, message, posted_at)
- **schedules** — planned maintenance (title, body, starts_at, ends_at, components)
- **subscribers** — email, confirmed_at, unsubscribe_token, optional component_id (scoped subscription)
- **probes** — every probe result (component_id, ok, status_code, latency_ms, observed_at) — used for the 90-day uptime line

## Probe loop

A `node-cron` task runs in-process every `PROBE_INTERVAL_SECONDS` (default 60). For each component:

1. Fire an HTTP GET against `probe_url`
2. Record `(ok, status_code, latency_ms, observed_at)` in the `probes` table
3. If the component has been failing for ≥ 2 consecutive probes and there is no open incident, **auto-create an incident** in `Investigating` with severity = component's `severity_when_down`
4. If the component recovers and there is an open auto-incident, post a `Monitoring` update — never auto-close (a human marks `Resolved`)

The scheduler boots from `instrumentation.ts` so it starts when the Next.js process starts. There is no separate worker container.

If we outgrow in-process scheduling, the migration is well-defined: move probes to Railway's [Cron Jobs](https://docs.railway.app/reference/cron-jobs) calling `POST /api/internal/probe` (protected by a shared secret).

## Failure isolation

The status page **must not** depend on the systems it reports on. Concretely:

- Hosted on Railway, fully separate from our app cluster
- Postgres is Railway-managed (not the shared production DB)
- Email through Resend, not the primary transactional sender
- If the page itself goes down, fall back to the official Harbour.Space Twitter/X and the announcements channel

## Integrations

| Direction | System | Purpose |
|-----------|--------|---------|
| Out | Slack `#status-incidents` | Mirror every incident update |
| Out | Telegram (on-call channel) | Major outages only |
| Out | Email subscribers (Resend) | User-facing notifications |
| Out | Atom/RSS feed at `/feed.atom` | Public consumption |
| Out | REST API at `/api/components`, `/api/incidents` | Programmatic access (e.g. embed status indicators in harbour.space + student-space) |
| In | `POST /api/webhooks/incident` | External monitoring (UptimeRobot / Better Stack) can also push incidents — useful as a backup signal to our in-process probe loop |
