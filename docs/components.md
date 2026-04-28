# Components to monitor

Initial set. Owners and probes to be confirmed during implementation (see Linear issue `Define monitored components and probes`).

## Student-facing

| Component | URL | Owner team | Probe | Severity if down |
|-----------|-----|------------|-------|------------------|
| Marketing website | https://harbour.space | Frontend | HTTP 200 on `/` | Major |
| Student Space | https://student.harbour.space | Backend (student-space-laravel) | HTTP 200 on `/login` | Major |
| LMS | https://lms.harbour.space | LMS team | HTTP 200 on `/` | Major |
| Admissions portal | https://apply.harbour.space | Admissions tech | HTTP 200 on `/` | Major |
| Authentication / SSO | https://auth.harbour.space | Platform | HTTP 200 on `/.well-known/openid-configuration` | Major |

## Internal / shared infrastructure

| Component | URL / Service | Owner team | Probe | Severity if down |
|-----------|---------------|------------|-------|------------------|
| API gateway | https://api.harbour.space | Platform | HTTP 200 on `/health` | Partial |
| Visual Regression Service | https://qa.harbour.space | QA / Frontend | HTTP 200 on `/` | Partial |
| Email delivery (SMTP) | mail.harbour.space:587 | Platform | TCP open + EHLO | Partial |
| File storage / CDN | (provider) | Platform | HEAD on canonical asset | Partial |

## Component groups (UI organisation)

1. **Student-facing services** — what students and applicants interact with
2. **Internal services** — engineering-facing tools and shared infrastructure
3. **Email & notifications** — outbound delivery
4. **Third-party dependencies** (read-only, mirrored from upstream): Cloudflare, AWS region(s) we use, GitHub, payment processor

The third-party group is informational — it links to the providers' own status pages rather than running our own probes against them.

## Severity levels

The app supports five status levels per component. These map directly to what the public page renders.

| Status | When to use |
|--------|-------------|
| Operational | Everything fine |
| Performance issues | Latency or error rate elevated but service usable |
| Partial outage | Some users / some features affected |
| Major outage | Service unreachable or unusable for most users |
| Under maintenance | Planned work in progress |

## Naming convention

Component name = the human-friendly product name, not the hostname. Example: "Student Space", not "student.harbour.space". Hostname goes in the description.
