# Incident runbook

When a Harbour.Space service is degraded or down, the **on-call engineer** is responsible for keeping `status.harbour.space` accurate.

## 1. Open the incident first

Before debugging, open the admin dashboard at `https://status.harbour.space/admin` and create an incident:

- **Title**: short, user-facing, no internal jargon. Good: "Student Space login is failing". Bad: "Redis connection timeout in auth-svc".
- **Status**: `Investigating`
- **Affected components**: every component a user might notice. When in doubt, include it.
- **Component status**: set each affected component to the right level (Performance / Partial / Major).
- **Visibility**: Public.

Why first? Users hit refresh and check Twitter. A status page that's silent during an outage is worse than no status page.

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

For planned work, create a **Schedule** (not an Incident) at least 48 hours in advance:

- Title: "Scheduled maintenance — \[component]"
- Start / end times in UTC
- What changes for users (downtime? read-only? no impact?)
- Send notification to subscribers (the app does this automatically when the schedule is published)

## 6. Communication channels (in order)

1. `status.harbour.space` — the source of truth
2. Slack `#status-incidents` — mirrored automatically
3. Email subscribers — automatic from Cachet
4. Twitter/X (only for Major outages affecting many users)

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
