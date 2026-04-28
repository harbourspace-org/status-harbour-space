# syntax=docker/dockerfile:1.7
# Lightweight uptime monitor agent.
#
# Runs in multiple zones (Railway + internal servers). Each instance probes
# the components defined upstream and posts the results to the central
# Status Page. See docs/uptime-monitor.md for the full design.

# ── Stage 1 — install deps ─────────────────────────────────────────────
FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci

# ── Stage 2 — build ────────────────────────────────────────────────────
FROM node:20-alpine AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

# ── Stage 3 — runtime ──────────────────────────────────────────────────
FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production

RUN addgroup --system --gid 1001 nodejs && \
    adduser  --system --uid 1001 nodejs

COPY --from=build --chown=nodejs:nodejs /app/package.json /app/package-lock.json* ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=build --chown=nodejs:nodejs /app/dist ./dist

USER nodejs
CMD ["node", "dist/index.js"]
