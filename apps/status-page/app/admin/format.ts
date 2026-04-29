export function formatRelative(input: Date | string | null): string {
  if (!input) return 'never';
  const d = typeof input === 'string' ? new Date(input) : input;
  const seconds = Math.round((Date.now() - d.getTime()) / 1000);
  if (seconds < 0) {
    const future = -seconds;
    if (future < 60) return `in ${future}s`;
    const m = Math.round(future / 60);
    if (m < 60) return `in ${m} min`;
    const h = Math.round(m / 60);
    if (h < 24) return `in ${h}h`;
    return `in ${Math.round(h / 24)}d`;
  }
  if (seconds < 60) return `${seconds}s ago`;
  const m = Math.round(seconds / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.round(h / 24)}d ago`;
}

export function formatDateTime(input: Date | string): string {
  const d = typeof input === 'string' ? new Date(input) : input;
  return d.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function toDatetimeLocalValue(input: Date | string | null): string {
  if (!input) return '';
  const d = typeof input === 'string' ? new Date(input) : input;
  // <input type="datetime-local"> wants local time without TZ suffix.
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function parseDatetimeLocal(value: string): Date | null {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d;
}
