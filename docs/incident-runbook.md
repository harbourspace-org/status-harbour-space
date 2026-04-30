# Incident runbook

When a Harbour.Space service is degraded or down, the **on-call engineer** is responsible for keeping `status.harbour.space` accurate. This document is the operational guide.

> **Acknowledgement.** Every on-call engineer must read this end-to-end before their first shift, and re-read after any change announced in `#status-incidents`. New engineers ack in the on-call onboarding doc.

## 0. On-call rotation and escalation

**Schedule.** The rotation is defined in `<TODO: PagerDuty / Opsgenie URL>`. Each shift has a **primary** and a **secondary** engineer.

**Escalation.**

| Step | Trigger | Action |
|------|---------|--------|
| 0 | Auto-incident or page fires | Primary on-call gets paged |
| 1 | 5 min without primary ack | Page secondary on-call |
| 2 | 15 min without any ack | Page engineering manager (`<TODO: name + Slack handle>`) |
| 3 | 30 min and still unacked | Page CTO |

**During an incident.**
- Primary owns communication on `status.harbour.space` and `#status-incidents`. They do not also own debugging — secondary or another engineer handles that.
- Hand-off is explicit: "I'm taking over comms, you keep debugging" must be said in `#status-incidents`.

**Off-shift.** If you are not on-call, do not ack incidents. Acking interferes with the escalation timer and can leave the actual on-call thinking nobody is responding.

## 1. Open the incident first

Before debugging, open the admin dashboard at `https://status.harbour.space/admin` and create an incident:

- **Title**: short, user-facing, no internal jargon. Good: "Student Space login is failing". Bad: "Redis connection timeout in auth-svc".
- **Status**: `Investigating`
- **Affected components**: every component a user might notice. When in doubt, include it.
- **Component status**: set each affected component to the right level (Performance / Partial / Major).
- **Visibility**: Public.

Why first? Users hit refresh and check Twitter. A status page that's silent during an outage is worse than no status page.

> **Auto-incidents.** When the uptime monitor sees a probe fail, the system opens an incident automatically (`posted_by: auto-monitor`). Always check `/admin/incidents` before manually creating — duplicating an auto-incident causes double notifications.

## 2. Update every 30 minutes minimum

Even "still investigating, no new info" is useful. The incident timeline goes:

```
Investigating → Identified → Monitoring → Resolved
```

- **Investigating**: we know something is wrong, root cause unknown
- **Identified**: we know the cause and are working on a fix
- **Monitoring**: fix deployed, watching for recurrence
- **Resolved**: confirmed working, incident closed

Never skip a step. If you go straight from `Investigating` to `Resolved` users assume you got lucky, not that you fixed it.

## 3. Component statuses

Reflect reality:

- Site loads but is slow → Performance issues
- Some users blocked, others fine → Partial outage
- Nobody can use it → Major outage

Reset to Operational only when the fix is verified, not when it's deployed.

## 4. Resolve and post-mortem

When marking Resolved, the final update should include:

- One-sentence summary of what happened
- Time the issue started and ended (UTC)
- Brief, blameless explanation of the cause
- What was done to fix it
- Link to the internal post-mortem doc if there is one (do not paste internal details)

Example:
> **Resolved at 14:32 UTC.** Between 13:05 and 14:28 UTC, Student Space login was failing for ~40% of users due to a database connection pool exhaustion after a deploy. We rolled back, the issue stopped, and we are investigating the root cause. We are sorry for the disruption.

## 5. Scheduled maintenance

For planned work, create a **Schedule** (not an Incident) in `/admin/schedules/new`. **Minimum 48 hours advance notice** for any maintenance with user-visible impact.

### Template

```
Title:        Scheduled maintenance — <component>
Start (UTC):  YYYY-MM-DD HH:MM
End (UTC):    YYYY-MM-DD HH:MM (estimated)
Components:   <pick from the list — only the ones actually affected>
Description:
  What we're doing: <plain-language summary>
  Impact:           <downtime / read-only / brief blip / no impact>
  Why now:          <one sentence — e.g. "low traffic window">
  Rollback plan:    <one sentence>
```

### When to use it

- Use a **Schedule** for planned work that has a defined start/end.
- Use an **Incident** for unplanned degradation, even if the cause is known.
- If a schedule overruns and turns into a real outage: open an Incident, mark the Schedule as Completed, and reference the schedule in the incident's first update.

### After completion

Mark the schedule as **Completed** in `/admin/schedules` so the public homepage stops showing it. Subscribers automatically receive a "completed" notification.

## 6. Communication channels (in order)

1. `status.harbour.space` — the source of truth
2. Slack `<TODO: #status-incidents>` — mirrored automatically (every incident open + every update)
3. Telegram on-call group — **only fires for `Major outage` severity**, by design
4. Email subscribers — automatic via Resend
5. Twitter/X (only for Major outages affecting many users — coordinate with `<TODO: comms / marketing contact>`)

Never communicate an incident only on Slack. If it's on Slack, it must be on the status page.

## 7. Severity decision tree

```
Is the service reachable at all?
├─ No  ────► Major outage
└─ Yes
    ├─ Are most users affected?  ────► Major outage
    ├─ Are some users / some features affected?  ────► Partial outage
    ├─ Is it just slow or erroring intermittently?  ────► Performance issues
    └─ Working normally?  ────► Operational
```

## 8. Common pitfalls

Things that have bitten on-call engineers in past sessions. Add to this list whenever a real incident exposes a new one.

- **Acking off-shift.** Don't ack a page if you're not the on-call for this shift — it suppresses escalation to the actual primary.
- **Resolving before verification.** Mark Resolved only after `Monitoring` time has passed and the fix is confirmed. The flow is `Identified → Monitoring → Resolved`, never directly `Identified → Resolved`.
- **Internal jargon in titles.** Users read incident titles in Slack/email/Twitter. "Auth-svc Redis pool exhausted" means nothing to them. "Student Space login is failing" does.
- **Forgetting affected components.** Auto-incidents tag only the component that tripped the probe. If two components share infra and both are down, edit the incident to add the second component — otherwise users of the second component don't see anything wrong on the homepage.
- **Manually opening a duplicate.** Always check `/admin/incidents` for an open auto-incident before creating a new one for the same component. Two incidents = two Slack messages, two Telegram alerts, double the email volume.
- **Slack-only updates.** Posting "we're on it" only in Slack leaves the status page silent. The status page is the source of truth; Slack is a mirror.
- **Wrong severity.** Telegram fires on `Major outage` only. If you set a real major outage as `Partial`, the on-call group won't get woken up. Lean toward higher severity if uncertain.
- **Forgetting to mark schedules Complete.** A finished maintenance window left "in progress" keeps the public banner up and confuses users.
- **Posting customer details.** Resolution updates are public. Never include user emails, internal ticket IDs, or hostnames that aren't already public.

## 9. Tooling reference

| Tool | URL / location | Use |
|------|----------------|-----|
| Public page | https://status.harbour.space | What users see |
| Admin | https://status.harbour.space/admin | Create / update incidents and schedules |
| Staging | https://status-staging.harbour.space | Hands-on training, fire drills |
| Public REST | `/api/components`, `/api/incidents` | For external integrations |
| Atom feed | `/feed.atom` | For feed readers |
| Slack | `<TODO: #status-incidents>` | Auto-mirrored incidents |
| Telegram | `<TODO: on-call group invite>` | Major outages only |
| Rotation | `<TODO: PagerDuty / Opsgenie URL>` | Who is on-call now |
| Onboarding doc | `<TODO: link>` | New on-call engineer reading list |
| Engineering Notion / Drive | `<TODO: link>` | Recordings of training drills, post-mortems |

> Replace every `<TODO: …>` with the real link or contact during the team meeting (HSDEV-614 sub-task 1).
