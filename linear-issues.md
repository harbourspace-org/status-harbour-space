# Linear backlog — status.harbour.space

All issues in English (per team convention). Suggested project: **"Status Page (status.harbour.space)"** under the team that owns Platform / Infra. Suggested labels in `[brackets]` per issue.

Copy each block into Linear. The title is the first line; the body is everything below it until the next `---`.

---

## Phase 1 — Infrastructure & setup

### Provision VPS for the status page
**Labels:** `infra`, `phase-1` · **Priority:** High · **Estimate:** 2 points

Provision a dedicated VPS for `status.harbour.space`. **Must not** share infrastructure with the production app cluster — the status page has to stay up when our other services are down.

**Acceptance criteria**
- Ubuntu 24.04 LTS, 2 vCPU / 4 GB RAM, in a region geographically separate from our main cluster
- Inbound 80/443 open, all other ports closed
- Unattended-upgrades enabled for security patches
- Docker + Docker Compose v2 installed
- SSH key access only, no passwords
- Hostname documented in the infra inventory

---

### Configure DNS for status.harbour.space
**Labels:** `infra`, `dns`, `phase-1` · **Priority:** High · **Estimate:** 1 point · **Blocked by:** Provision VPS

Point `status.harbour.space` at the new VPS through Cloudflare.

**Acceptance criteria**
- `status.harbour.space` A record → VPS public IP
- Cloudflare proxy enabled (orange cloud)
- TLS mode set to **Full (strict)**
- HSTS enabled
- `status-staging.harbour.space` configured the same way for the staging stack

---

### Issue origin TLS certificate
**Labels:** `infra`, `security`, `phase-1` · **Priority:** High · **Estimate:** 1 point · **Blocked by:** Configure DNS

Generate a Cloudflare origin certificate (15-year validity) and install on the VPS for nginx termination. Document renewal procedure even though it is far in the future.

**Acceptance criteria**
- Origin certificate installed at `/etc/ssl/cachet/origin.crt` + `.key`
- nginx serves HTTPS on 443 with the certificate
- A1 / SSL Labs grade verified manually
- Renewal procedure documented in `docs/deployment.md`

---

### Bring up Cachet via docker-compose
**Labels:** `infra`, `phase-1` · **Priority:** High · **Estimate:** 3 points · **Blocked by:** Provision VPS, Issue TLS

Deploy the Cachet stack defined in `docker-compose.yml` to the VPS. Bring it up behind nginx with TLS.

**Acceptance criteria**
- Compose stack running: app + postgres + redis
- `php artisan migrate` and `cachet:install` executed
- First admin user created via `cachet:user:create`
- `https://status.harbour.space/dashboard` reachable and returns 200
- `/api/v1/ping` returns `{"data":"Pong!"}`
- Container restart policy verified by rebooting the host

---

### Configure SMTP provider for subscriber notifications
**Labels:** `infra`, `email`, `phase-1` · **Priority:** Medium · **Estimate:** 2 points

Pick and configure an SMTP provider for outbound subscriber notifications. The provider must be **independent** from our primary transactional sender so a mail-side incident does not also break the status page.

**Acceptance criteria**
- Provider chosen (Postmark / SendGrid / SES — write rationale in issue comments)
- Sending domain `status.harbour.space` SPF + DKIM + DMARC verified
- `MAIL_*` env vars set in `.env` on the VPS
- Test email delivered to a personal inbox + checked in Mail-Tester (score ≥ 9/10)

---

### Set up nightly Postgres backups to S3
**Labels:** `infra`, `backups`, `phase-1` · **Priority:** Medium · **Estimate:** 2 points · **Blocked by:** Bring up Cachet

Implement the cron job described in `docs/deployment.md`. Verify a restore actually works.

**Acceptance criteria**
- Cron at 03:00 UTC takes `pg_dump` and uploads to `s3://harbour-backups/status/`
- Retention: 30 days local, 90 days in S3
- Restore exercise performed against a throwaway VM with a recent dump
- Alert configured if the backup fails or the file size drops > 50 % vs the previous day

---

## Phase 2 — Cachet configuration

### Define monitored components and probes
**Labels:** `config`, `phase-2` · **Priority:** High · **Estimate:** 2 points

Finalise the list of components in `docs/components.md` with each owner team. For every component, decide the probe (URL + expected response) and the severity mapping when it fails.

**Acceptance criteria**
- Each row in `docs/components.md` has a confirmed owner team
- Each component has a probe URL and expected status code documented
- Sign-off from each owner team in the issue comments
- The list is loaded into Cachet as actual components

---

### Create component groups in Cachet
**Labels:** `config`, `phase-2` · **Priority:** Medium · **Estimate:** 1 point · **Blocked by:** Define monitored components

Create the four groups in Cachet admin (Student-facing, Internal, Email & Notifications, Third-party dependencies) and assign components to them.

**Acceptance criteria**
- All four groups exist in Cachet admin
- Every component is in exactly one group
- Display order matches `docs/components.md`
- Public homepage shows the groups in the right order

---

### Customise branding (logo, colors, favicon, theme)
**Labels:** `design`, `phase-2` · **Priority:** Medium · **Estimate:** 2 points

Apply Harbour.Space brand to the public page. Coordinate with the design team for assets.

**Acceptance criteria**
- Logo uploaded (SVG preferred)
- Favicon set
- Primary colour matches harbour.space brand palette
- "Powered by Cachet" footer either kept (license requirement) or replaced as the license allows
- Mobile breakpoints reviewed manually on iOS Safari and Android Chrome

---

### Set up internationalisation (English + Spanish)
**Labels:** `i18n`, `phase-2` · **Priority:** Low · **Estimate:** 2 points

Cachet ships with translations. Verify Spanish is complete and that the language toggle works on the public page.

**Acceptance criteria**
- Spanish translation reviewed for status terms ("Operational" → "Operativo", etc.) by a native speaker on the team
- Language toggle visible in header
- Default language is English
- Subscriber notification emails sent in the subscriber's preferred language

---

### Create admin users for the engineering team
**Labels:** `config`, `phase-2` · **Priority:** Medium · **Estimate:** 1 point

Create Cachet admin accounts for everyone on-call. Use SSO if possible; otherwise individual accounts with strong passwords + 2FA.

**Acceptance criteria**
- Account created for each on-call engineer
- 2FA enforced
- Roles assigned (admin / manager) per the policy in `docs/incident-runbook.md`
- Test login from each account

---

## Phase 3 — Monitoring integrations

### Choose and configure external uptime monitoring
**Labels:** `monitoring`, `phase-3` · **Priority:** High · **Estimate:** 3 points

Pick UptimeRobot or Better Stack (or another) and configure probes for every component defined in Phase 2.

**Acceptance criteria**
- Provider chosen (write rationale: cost, frequency, integration quality)
- One probe per public component, frequency ≤ 1 minute
- Probes run from at least two geographic regions
- Status page in the chosen provider mirrors `docs/components.md`
- Alerts go to the on-call engineer (PagerDuty / phone)

---

### Auto-create Cachet incidents from monitoring webhooks
**Labels:** `monitoring`, `automation`, `phase-3` · **Priority:** High · **Estimate:** 5 points · **Blocked by:** Choose monitoring

Build a small webhook receiver that translates monitoring-tool alerts into Cachet API calls. When a probe fails for >2 consecutive checks, automatically open an incident with status `Investigating` and set the component to `Partial outage`. When the probe recovers, post a `Monitoring` update; do not auto-close (humans confirm resolution).

**Acceptance criteria**
- Endpoint deployed (can live in the same Cachet container as a small PHP route, or a separate worker — decide in design comments)
- Authenticated with a shared secret in `.env`
- Maps monitoring component IDs to Cachet component IDs via config file
- Idempotent — duplicate webhooks do not create duplicate incidents
- Tested with a forced probe failure in staging

---

### Mirror incidents to Slack `#status-incidents`
**Labels:** `integrations`, `phase-3` · **Priority:** Medium · **Estimate:** 2 points

Use the Cachet Slack webhook integration so that every incident creation and update posts to a dedicated channel.

**Acceptance criteria**
- Channel `#status-incidents` created and pinned to the engineering Slack
- Slack webhook URL set in `.env` (`SLACK_WEBHOOK_URL`)
- Test incident triggers a Slack post with title, status, and a link
- Updates and resolution posts also appear

---

### Telegram integration for on-call ops channel
**Labels:** `integrations`, `phase-3` · **Priority:** Low · **Estimate:** 2 points

Mirror critical (Major outage) incidents to the existing on-call Telegram group.

**Acceptance criteria**
- Telegram bot created and added to the on-call group
- Bot token + chat ID set in `.env`
- Only Major outages trigger the Telegram notification (lower severities stay in Slack only — too noisy otherwise)
- Resolution posts also forwarded

---

### Verify email subscriptions end-to-end
**Labels:** `email`, `phase-3` · **Priority:** Medium · **Estimate:** 1 point · **Blocked by:** Configure SMTP

Manually test the public subscription flow: visitor enters email → verification email arrives → click confirms → next incident triggers a notification.

**Acceptance criteria**
- Subscription confirmation email arrives within 60 s
- Confirmation link works
- Component-scoped subscriptions tested (subscribe to one component only, confirm no email when an unrelated component has an incident)
- Unsubscribe link works
- All emails pass SPF/DKIM/DMARC

---

### Publish Atom/RSS feed and link from harbour.space
**Labels:** `integrations`, `phase-3` · **Priority:** Low · **Estimate:** 1 point

Cachet exposes `/atom` out of the box. Add a discoverable link tag and document the URL.

**Acceptance criteria**
- `/atom` returns valid Atom XML (validate with W3C feed validator)
- `<link rel="alternate" type="application/atom+xml">` added to the page `<head>`
- URL documented in `docs/deployment.md`
- Test feed in NetNewsWire or Feedly

---

## Phase 4 — Process & content

### Refine incident response runbook with the on-call team
**Labels:** `docs`, `phase-4` · **Priority:** Medium · **Estimate:** 1 point

Walk through `docs/incident-runbook.md` with the on-call rotation. Update with any team-specific details (escalation contacts, internal Slack channels, paging). Keep external-facing details out — runbook lives in this private repo, but no internal hostnames or credentials.

**Acceptance criteria**
- Reviewed and signed off in a 30-min team meeting
- All on-call engineers acknowledge they have read it
- Runbook linked from the on-call onboarding doc

---

### Define on-call rotation and escalation policy
**Labels:** `process`, `phase-4` · **Priority:** Medium · **Estimate:** 2 points

Decide who is responsible for keeping the status page accurate during an incident, and how escalation works if the primary on-call is unavailable.

**Acceptance criteria**
- Rotation schedule defined in PagerDuty / Opsgenie / equivalent
- Primary + secondary defined for every shift
- Escalation policy: 5 min no-ack → secondary, 15 min → engineering manager
- Documented in `docs/incident-runbook.md`

---

### Create scheduled maintenance template
**Labels:** `process`, `docs`, `phase-4` · **Priority:** Low · **Estimate:** 1 point

Write a reusable template for scheduled maintenance announcements (title, body sections, components to mark, advance notice required).

**Acceptance criteria**
- Template added to `docs/incident-runbook.md`
- One historical maintenance event posted using the template (back-dated, marked as Completed) so the public page shows an example
- Minimum 48 h advance notice rule documented

---

### Train on-call engineers on creating incidents
**Labels:** `training`, `phase-4` · **Priority:** Medium · **Estimate:** 1 point

Run a 30-minute hands-on session in staging where each on-call engineer creates a fake incident, posts updates, marks it resolved, and triggers a notification.

**Acceptance criteria**
- All on-call engineers complete the exercise in staging
- Common pitfalls documented in `docs/incident-runbook.md`
- Recording posted in the engineering Notion / Drive

---

### Add status page link to harbour.space and student-space headers
**Labels:** `frontend`, `phase-4` · **Priority:** Medium · **Estimate:** 1 point

Once the page is live, link to it from the products. Footer link on the marketing site; small "System status" indicator (green dot) in the student-space header.

**Acceptance criteria**
- Footer link added to harbour.space (`frontend-react` repo)
- Status indicator added to student-space header (`student-space-laravel` repo)
- Indicator polls `https://status.harbour.space/api/v1/components` every 5 minutes and reflects the worst component status
- Indicator caches the last response so a status-page outage does not block page render

---

## Phase 5 — Launch

### Soft launch on status-staging.harbour.space
**Labels:** `launch`, `phase-5` · **Priority:** High · **Estimate:** 2 points

Run the full stack on the staging subdomain for at least one week. Wire up monitoring against staging components. Confirm webhooks, email, Slack, Telegram all work.

**Acceptance criteria**
- Staging stack live for ≥ 7 days with no manual intervention
- All Phase 3 integrations exercised against staging
- One simulated incident per integration (auto-created from probe failure, posted in Slack, email sent)

---

### Run an end-to-end fire drill
**Labels:** `launch`, `phase-5` · **Priority:** High · **Estimate:** 2 points · **Blocked by:** Soft launch

Simulate a real Major outage in a maintenance window and run the full incident process: open incident, post updates, escalate, resolve, post-mortem. Verify subscribers receive emails and Slack/Telegram fire.

**Acceptance criteria**
- Fire drill executed against the staging subdomain
- Timeline reviewed in a retrospective
- Any gaps in the runbook fixed
- Subscriber email + Slack + Telegram all received the notification

---

### Cut over DNS to production
**Labels:** `launch`, `phase-5` · **Priority:** High · **Estimate:** 1 point · **Blocked by:** Fire drill

Flip `status.harbour.space` to point at the production stack. Keep staging running.

**Acceptance criteria**
- `status.harbour.space` resolves to production VPS
- Cloudflare proxy + TLS verified
- Subscribe form, dashboard login, public page all reachable
- Existing subscribers (if migrated) receive a "you are subscribed" confirmation

---

### Internal + external launch announcement
**Labels:** `launch`, `comms`, `phase-5` · **Priority:** Medium · **Estimate:** 1 point · **Blocked by:** Cut over DNS

Announce the new status page internally (engineering + ops + support) and externally (Twitter, blog post, footer link).

**Acceptance criteria**
- Internal Slack announcement in `#engineering` and `#general`
- Support team briefed (they should redirect "is X down?" tickets to the page)
- One short Twitter / LinkedIn post
- Footer link live on harbour.space and student-space (see "Add status page link" issue)

---

### Two-week post-launch review
**Labels:** `launch`, `retro`, `phase-5` · **Priority:** Low · **Estimate:** 1 point · **Blocked by:** Internal + external launch

Two weeks after launch, review what worked and what did not.

**Acceptance criteria**
- Review meeting held
- Subscriber count and incident count summarised
- Any UX or process issues filed as new Linear issues
- Decision: keep Cachet or migrate to a different tool, with rationale

---

## Stretch / nice-to-have

These are not required for launch but worth tracking:

- **Status badge images** — generate `/badge.svg` per component for embedding in READMEs
- **Public uptime metrics page** — show response time + uptime graph per component (Cachet metrics)
- **FAQ page for users** — explain what each status level means in plain language
- **Incident export** — monthly CSV/JSON export of incidents for internal reporting
- **Auto-generated post-mortems** — pre-fill a Notion / Drive doc when an incident is resolved
- **Component dependency graph** — model that "if Auth is down, Student Space and LMS are also down" so we do not create three duplicate incidents
