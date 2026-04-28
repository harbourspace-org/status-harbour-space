# syntax=docker/dockerfile:1.7
# Single-image production build for the React Router 7 status page.
# Deployed to Railway. See docs/deployment.md.

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
# Builds React Router (server + client bundles into ./build) and the
# custom server entry (`server.js`) used to boot Hono + the probe cron.
RUN npm run build

# ── Stage 3 — runtime ──────────────────────────────────────────────────
FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000

RUN addgroup --system --gid 1001 nodejs && \
    adduser  --system --uid 1001 nodejs

# Production-only deps (smaller image)
COPY --from=build --chown=nodejs:nodejs /app/package.json /app/package-lock.json* ./
RUN npm ci --omit=dev && npm cache clean --force

# React Router build output + custom server entry
COPY --from=build --chown=nodejs:nodejs /app/build ./build
COPY --from=build --chown=nodejs:nodejs /app/server.js ./server.js

USER nodejs
EXPOSE 3000
CMD ["node", "server.js"]
