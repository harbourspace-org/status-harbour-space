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

// Single source of truth: maintenance windows (and all admin timestamps) are
// entered, stored, and displayed against this one IANA zone. Using the zone
// name — never a fixed +01:00/+02:00 offset — keeps CET/CEST DST automatic.
// HSDEV-795: before, datetime-local wall-clock strings were parsed/rendered in
// the *runtime's* zone (UTC on the server), while the public page rendered the
// resulting instant in the *viewer's* zone, causing a CET/CEST-sized skew.
export const DISPLAY_TIME_ZONE = 'Europe/Madrid';

// Offset, in ms, of `timeZone` from UTC at a given absolute instant (DST-aware).
function timeZoneOffsetMs(instant: Date, timeZone: string): number {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
  const parts: Record<string, string> = {};
  for (const p of dtf.formatToParts(instant)) {
    if (p.type !== 'literal') parts[p.type] = p.value;
  }
  // The same instant expressed as a UTC wall-clock equal to its `timeZone`
  // wall-clock; the gap between that and the real instant is the offset.
  const asUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour),
    Number(parts.minute),
    Number(parts.second),
  );
  return asUtc - Math.floor(instant.getTime() / 1000) * 1000;
}

// Interpret naive wall-clock components as local time in `timeZone` and return
// the corresponding absolute UTC instant (DST-aware, including the spring-forward
// gap and autumn fall-back overlap).
function zonedWallClockToUtc(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  timeZone: string,
): Date {
  const guess = Date.UTC(year, month - 1, day, hour, minute);
  const offset1 = timeZoneOffsetMs(new Date(guess), timeZone);
  let utc = guess - offset1;
  // Re-check at the candidate instant: near a DST boundary the offset that
  // actually applies can differ from the first guess.
  const offset2 = timeZoneOffsetMs(new Date(utc), timeZone);
  if (offset2 !== offset1) utc = guess - offset2;
  return new Date(utc);
}

function partsInZone(
  instant: Date,
  timeZone: string,
): Record<string, string> {
  const dtf = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
  const out: Record<string, string> = {};
  for (const p of dtf.formatToParts(instant)) {
    if (p.type !== 'literal') out[p.type] = p.value;
  }
  return out;
}

export function formatDateTime(input: Date | string): string {
  const d = typeof input === 'string' ? new Date(input) : input;
  return d.toLocaleString('en-GB', {
    timeZone: DISPLAY_TIME_ZONE,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
    timeZoneName: 'short',
  });
}

export function toDatetimeLocalValue(input: Date | string | null): string {
  if (!input) return '';
  const d = typeof input === 'string' ? new Date(input) : input;
  // <input type="datetime-local"> wants a naive wall-clock with no TZ suffix.
  // Render the stored instant as its Europe/Madrid wall-clock so the control
  // round-trips exactly through parseDatetimeLocal below.
  const p = partsInZone(d, DISPLAY_TIME_ZONE);
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`;
}

export function parseDatetimeLocal(value: string): Date | null {
  if (!value) return null;
  // datetime-local: "YYYY-MM-DDTHH:mm" (optionally with ":ss"). Parse the
  // components explicitly and anchor them to Europe/Madrid — do NOT use
  // `new Date(value)`, which would silently use the runtime's zone (HSDEV-795).
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(value);
  if (!m) return null;
  const [, year, month, day, hour, minute] = m;
  const d = zonedWallClockToUtc(
    Number(year),
    Number(month),
    Number(day),
    Number(hour),
    Number(minute),
    DISPLAY_TIME_ZONE,
  );
  if (Number.isNaN(d.getTime())) return null;
  return d;
}
