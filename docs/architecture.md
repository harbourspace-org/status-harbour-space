# Architecture

## High-level

```
Internet ──► Cloudflare ──► Origin (status.harbour.space)
                                │
                       ┌────────┴────────┐
                       │   Nginx :443    │
                       │  (TLS, cache)   │
                       └────────┬────────┘
                                │
                       ┌────────▼────────┐
                       │  Cachet (PHP)   │
                       │  Laravel 11     │
                       └──┬──────────┬───┘
                          │          │
                ┌─────────▼─┐    ┌───▼─────────┐
                │ Postgres  │    │   Redis     │
                │   16      │    │ cache+queue │
                └───────────┘    └─────────────┘
                       ▲
                       │ HTTP API + webhooks
                       │
            ┌──────────┴────────────┐
            │ External monitoring   │
            │ (UptimeRobot / Better │
            │  Stack)               │
            └───────────────────────┘
```

## Why Cachet

- Open source, self-hostable (BSD-3-Clause)
- PHP/Laravel — same stack as `student-space-laravel` and the rest of our backend; easy for our team to extend
- Native concepts for components, incidents, scheduled maintenance, subscribers, metrics
- Public REST API for programmatic incident creation from monitoring tools
- Multi-language support out of the box

## Data model (Cachet)

- **Component** — a service we monitor (one row per service from `components.md`)
- **Component Group** — UI grouping (e.g. "Student-facing", "Internal", "Email & Notifications")
- **Incident** — an event with severity, affected component(s), and a timeline of updates
- **Schedule** — planned maintenance window
- **Metric** — a numeric series (e.g. response time)
- **Subscriber** — email subscription, optionally scoped to specific components

## Hosting

- **Platform**: Docker Compose on the existing Harbour.Space VPS pool (decision to confirm in HSDEV-INFRA-1)
- **TLS**: Let's Encrypt via certbot or Cloudflare origin certificate
- **DNS**: `status.harbour.space` → A record to origin, proxied through Cloudflare
- **Backups**: nightly `pg_dump` shipped to S3-compatible bucket
- **Logs**: stdout/stderr → docker logging driver → existing log aggregation

## Failure isolation

The status page **must not** depend on the systems it reports on. Concretely:

- Run on infrastructure separate from the main app cluster
- Use a dedicated Postgres (not the shared production DB)
- Mail goes through an SMTP provider independent of our primary mail (e.g. Postmark / SendGrid for status notifications, separate from the marketing/transactional sender)
- Cloudflare in front so the page stays reachable even if the origin is down (cached homepage)

If the status page itself fails, fall back to posting on the official Harbour.Space Twitter/X and the announcements channel.

## Integrations

| Direction | System | Purpose |
|-----------|--------|---------|
| In | UptimeRobot / Better Stack | Auto-create incidents when probes fail |
| In | Internal services (webhook) | Allow services to self-report degradation |
| Out | Slack `#status-incidents` | Mirror every incident update to engineering |
| Out | Telegram (ops channel) | On-call alerts |
| Out | Email subscribers | User-facing notifications |
| Out | Atom/RSS feed | Public consumption |
