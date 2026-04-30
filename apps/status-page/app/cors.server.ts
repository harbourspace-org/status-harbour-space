const DEFAULT_ORIGINS = [
  'https://harbour.space',
  'https://www.harbour.space',
  'https://student.harbour.space',
];

function allowedOrigins(): Set<string> {
  const raw = process.env.PUBLIC_API_CORS_ORIGINS;
  const list = raw
    ? raw.split(',').map((s) => s.trim()).filter(Boolean)
    : DEFAULT_ORIGINS;
  return new Set(list);
}

export function corsHeaders(request: Request): Record<string, string> {
  const origin = request.headers.get('origin');
  if (!origin) return {};
  if (!allowedOrigins().has(origin)) return {};
  return {
    'access-control-allow-origin': origin,
    vary: 'Origin',
  };
}
