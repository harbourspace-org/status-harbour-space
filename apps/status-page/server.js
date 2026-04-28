import { createServer } from 'node:http';

const PORT = Number(process.env.PORT) || 3000;

const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>Harbour.Space — Status</title>
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <style>
    :root { color-scheme: light dark; }
    body { font-family: -apple-system, system-ui, sans-serif; max-width: 640px; margin: 12vh auto; padding: 0 1.5rem; line-height: 1.55; }
    h1 { font-size: 1.6rem; margin: 0 0 .5rem; }
    p { margin: .25rem 0; opacity: .85; }
    .dot { display:inline-block; width:.55rem; height:.55rem; background:#3aa55d; border-radius:50%; margin-right:.5rem; vertical-align:middle; }
  </style>
</head>
<body>
  <h1><span class="dot"></span>Harbour.Space Status</h1>
  <p>Status page is being prepared. Real-time monitoring coming soon.</p>
  <p style="margin-top:1.5rem;font-size:.85rem;opacity:.6;">status.harbour.space · placeholder</p>
</body>
</html>
`;

// Scoped to status.harbour.space only — set in the app, not Cloudflare zone,
// so it does not affect sibling subdomains like student/lms/apply.
const HSTS = 'max-age=31536000; includeSubDomains; preload';

const server = createServer((req, res) => {
  res.setHeader('strict-transport-security', HSTS);
  if (req.url === '/api/health') {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', placeholder: true }));
    return;
  }
  res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
  res.end(html);
});

server.listen(PORT, () => {
  console.log(`status-page placeholder listening on :${PORT}`);
});
