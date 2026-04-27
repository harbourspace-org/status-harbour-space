# status.harbour.space

Public status page for Harbour.Space services. Built on [Cachet](https://cachethq.io/) (PHP / Laravel, self-hosted).

Production URL: **https://status.harbour.space** (pending DNS)

---

## What this gives users

- Real-time status of every public Harbour.Space service (Operational / Degraded / Partial Outage / Major Outage / Maintenance)
- 90-day uptime history per component
- Incident timeline with status progression (Investigating → Identified → Monitoring → Resolved)
- Scheduled maintenance announcements
- Subscriptions: email, Slack, webhook, Atom/RSS
- Public REST API for programmatic incident creation
- Multi-language UI (English / Spanish at minimum)

## Components to monitor (initial set)

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

The full mapping with severities, owners, and probes lives in [`docs/components.md`](docs/components.md).

---

## Architecture

```
                ┌──────────────────────┐
                │  status.harbour.space│  ← public visitors
                └─────────┬────────────┘
                          │ HTTPS (Cloudflare)
                ┌─────────▼────────────┐
                │   Cachet (Laravel)   │
                │   PHP-FPM + Nginx    │
                └─────┬──────────┬─────┘
                      │          │
              ┌───────▼───┐  ┌───▼─────────┐
              │ Postgres  │  │ Redis (cache│
              │ (incidents│  │  + queue)   │
              │ , history)│  └─────────────┘
              └───────────┘
                      ▲
                      │ webhooks / API
              ┌───────┴────────────────┐
              │ External monitoring    │
              │ (UptimeRobot / Better  │
              │  Stack / Pingdom)      │
              └────────────────────────┘
```

Details in [`docs/architecture.md`](docs/architecture.md).

---

## Local development

```bash
cp .env.example .env
# edit .env — set APP_KEY (php artisan key:generate after first up), DB_PASSWORD, MAIL_*
docker compose up -d
docker compose exec app php artisan migrate
docker compose exec app php artisan cachet:install
```

Then open http://localhost:8000 and follow the setup wizard.

## Deployment

See [`docs/deployment.md`](docs/deployment.md). Production runs behind Cloudflare with TLS termination at the origin (Let's Encrypt).

## Incident response

When something breaks, follow [`docs/incident-runbook.md`](docs/incident-runbook.md). TL;DR:

1. Open an incident in Cachet admin **before** debugging
2. Set the affected component to the right status
3. Post updates every 30 minutes minimum
4. Resolve and write a brief post-mortem in the incident description

## Project tracking

Implementation issues are tracked in Linear (HSDEV team). The full backlog is in [`linear-issues.md`](linear-issues.md) — copy-paste each block into Linear.

## License

MIT — see [LICENSE](LICENSE). Cachet is BSD-3-Clause.
