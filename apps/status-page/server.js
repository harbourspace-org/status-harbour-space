import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { Hono } from 'hono';
import { createRequestHandler } from 'react-router';

const PORT = Number(process.env.PORT) || 3000;
const HSTS = 'max-age=31536000; includeSubDomains; preload';

// React Router 7 framework-mode build output.
const build = await import('./build/server/index.js');
const reactRouterHandler = createRequestHandler(
  build,
  process.env.NODE_ENV ?? 'production',
);

const app = new Hono();

app.use('*', async (c, next) => {
  await next();
  c.header('strict-transport-security', HSTS);
});

app.get('/api/health', (c) => c.json({ status: 'ok' }));

// /api/internal/{components,heartbeat,probes} are now React Router
// routes (HMAC-protected) and reach reactRouterHandler via the
// catch-all below.

// Static assets emitted by the React Router client build (hashed JS/CSS in
// /assets/*, plus anything dropped into apps/status-page/public — favicon,
// logos, etc.). serveStatic falls through on miss so unknown paths still
// reach the React Router handler below.
app.use('/*', serveStatic({ root: './build/client' }));

// Everything else falls through to React Router (server-rendered routes).
app.all('*', (c) => reactRouterHandler(c.req.raw));

serve({ fetch: app.fetch, port: PORT }, (info) => {
  console.log(`status-page listening on :${info.port}`);
});
