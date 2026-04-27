# Deployment

## Prerequisites

- Docker + Docker Compose v2 on the host
- DNS control over `harbour.space`
- Cloudflare account with `harbour.space` zone
- SMTP credentials for `status@harbour.space`
- A separate VPS / VM not shared with the production app cluster (failure isolation)

## First-time setup

### 1. Provision the host

- Ubuntu 24.04 LTS, 2 vCPU / 4 GB RAM minimum
- Open inbound: 80, 443
- Set up unattended-upgrades for security patches

### 2. DNS

- `status.harbour.space` → A record to host's public IP
- Enable Cloudflare proxy (orange cloud)
- TLS mode: **Full (strict)** with origin certificate

### 3. Origin TLS

Either:

- **Cloudflare origin certificate** (recommended) — generate in Cloudflare dashboard, install as `/etc/ssl/cachet/origin.crt` + `.key`, no renewal needed for 15 years
- **Let's Encrypt** via certbot — automatic renewal, but origin must be reachable on port 80

### 4. Reverse proxy

A minimal nginx config is in `deploy/nginx/status.conf` (to be added — see Linear issue). Cachet listens on `:8000` inside the compose network; nginx terminates TLS and proxies to it.

### 5. Bring up the stack

```bash
git clone git@github.com:harbourspace-org/status-harbour-space.git
cd status-harbour-space
cp .env.example .env
# fill in DB_PASSWORD, MAIL_*, APP_URL=https://status.harbour.space
docker compose up -d
docker compose exec app php artisan key:generate
docker compose exec app php artisan migrate --force
docker compose exec app php artisan cachet:install
```

### 6. First admin user

```bash
docker compose exec app php artisan cachet:user:create
```

Then log in at `https://status.harbour.space/dashboard`.

## Routine operations

### Backups

A cron on the host runs nightly:

```bash
0 3 * * * docker compose -f /opt/status/docker-compose.yml exec -T postgres \
  pg_dump -U cachet cachet | gzip > /var/backups/cachet/$(date +%F).sql.gz && \
  aws s3 cp /var/backups/cachet/$(date +%F).sql.gz s3://harbour-backups/status/
```

Retention: 30 days local, 90 days S3.

### Updates

```bash
git pull
docker compose pull
docker compose up -d
docker compose exec app php artisan migrate --force
```

Pin image tags in production — never deploy `:latest` blindly. Update the tag, test in staging, then merge.

### Health checks

The container exposes `/api/v1/ping` which returns `{"data":"Pong!"}`. Cloudflare or an external probe should hit this every minute and alert if it fails.

## Staging

There is a separate stack `status-staging.harbour.space` for testing config and Cachet upgrades before production. Same compose file, different DNS, different `.env`.

## Rollback

Cachet upgrades that touch the schema are not always reversible. Before any upgrade:

1. Take a manual `pg_dump`
2. Snapshot the host (if the provider supports it)
3. Tag the current image version

Roll back by restoring the dump and switching the image tag.
