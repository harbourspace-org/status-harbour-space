# Components to monitor

Current scope: the four URLs Mayda actually wants to track on `status.harbour.space`.

## Student-facing services

| Component | URL | Probe | Severity if down |
|-----------|-----|-------|------------------|
| Marketing website | https://harbour.space | HTTP 200 on `/` | Major |
| Student Space | https://student.harbour.space | HTTP 200 on `/login` | Major |

## Internal services

| Component | URL | Probe | Severity if down |
|-----------|-----|-------|------------------|
| Student admin | https://student-admin.harbour.space | HTTP 200 on `/admin/login` | Partial |
| Visual Regression Service | https://qa.harbour.space | HTTP 200 on `/` | Partial |

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
