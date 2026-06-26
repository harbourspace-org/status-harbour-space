import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  formatDateTime,
  parseDatetimeLocal,
  toDatetimeLocalValue,
} from './format';

// HSDEV-795 regression guard.
//
// These tests MUST be run with the machine TZ set to something other than
// Europe/Madrid (the npm "test" script forces TZ=America/New_York). The whole
// bug was that wall-clock <-> instant conversion silently depended on the
// runtime timezone; if any of this logic regresses to new Date(naiveString)
// or Date.prototype.getHours(), these assertions break under a non-Madrid TZ.

test('CEST (summer): 22:00 Madrid wall-clock stores as 20:00Z', () => {
  // The exact entry from the bug report: 24/06/2026 22:00.
  const d = parseDatetimeLocal('2026-06-24T22:00');
  assert.ok(d);
  assert.equal(d.toISOString(), '2026-06-24T20:00:00.000Z');
});

test('CET (winter): 22:00 Madrid wall-clock stores as 21:00Z', () => {
  const d = parseDatetimeLocal('2026-01-15T22:00');
  assert.ok(d);
  assert.equal(d.toISOString(), '2026-01-15T21:00:00.000Z');
});

test('round-trip: parse then re-render yields the original wall-clock', () => {
  for (const wall of [
    '2026-06-24T22:00', // CEST
    '2026-01-15T09:30', // CET
    '2026-12-31T23:45', // year boundary
  ]) {
    const instant = parseDatetimeLocal(wall);
    assert.ok(instant);
    assert.equal(toDatetimeLocalValue(instant), wall);
  }
});

test('admin and public agree: both render the same instant in Madrid time', () => {
  // The crux of HSDEV-795: given one stored instant, the admin formatter and
  // the public formatter must show the same wall-clock.
  const instant = parseDatetimeLocal('2026-06-24T22:00');
  assert.ok(instant);

  const admin = formatDateTime(instant); // en-GB, Europe/Madrid
  // Mirror the public page's formatter (app/routes/_index.tsx:formatDate).
  const publicStr = new Date(instant.toISOString()).toLocaleString('en-GB', {
    timeZone: 'Europe/Madrid',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZoneName: 'short',
  });

  // Same day, same hour:minute, same zone label on both sides.
  assert.match(admin, /22:00/);
  assert.match(admin, /24\/06\/2026/);
  assert.match(publicStr, /22:00/);
  assert.match(publicStr, /CEST/);
  assert.match(admin, /CEST/);
});

test('midnight crossover: 00:10 Madrid stays on the entered calendar day', () => {
  const d = parseDatetimeLocal('2026-06-25T00:10');
  assert.ok(d);
  // 00:10 CEST -> 22:10Z previous day, but it must render back as 25 Jun 00:10.
  assert.equal(d.toISOString(), '2026-06-24T22:10:00.000Z');
  assert.equal(toDatetimeLocalValue(d), '2026-06-25T00:10');
});

test('DST spring-forward + autumn fall-back resolve to valid instants', () => {
  // Spain springs forward 2026-03-29 02:00->03:00 (CET->CEST).
  const spring = parseDatetimeLocal('2026-03-29T03:30');
  assert.ok(spring);
  assert.equal(spring.toISOString(), '2026-03-29T01:30:00.000Z'); // +02:00

  // Spain falls back 2026-10-25 03:00->02:00 (CEST->CET).
  const autumnBefore = parseDatetimeLocal('2026-10-25T01:30'); // still CEST
  const autumnAfter = parseDatetimeLocal('2026-10-25T03:30'); // CET
  assert.ok(autumnBefore && autumnAfter);
  assert.equal(autumnBefore.toISOString(), '2026-10-24T23:30:00.000Z');
  assert.equal(autumnAfter.toISOString(), '2026-10-25T02:30:00.000Z');
});

test('spring-forward gap: a non-existent wall-clock resolves deterministically', () => {
  // Spain springs forward 2026-03-29: 02:00 -> 03:00, so 02:30 never happens.
  // We must still produce a single, stable instant (no NaN, no crash). Our
  // algorithm pushes it forward across the gap: 02:30 -> 03:30 CEST (01:30Z).
  const d = parseDatetimeLocal('2026-03-29T02:30');
  assert.ok(d);
  assert.equal(d.toISOString(), '2026-03-29T01:30:00.000Z');
  assert.equal(toDatetimeLocalValue(d), '2026-03-29T03:30');
});

test('fall-back overlap: an ambiguous wall-clock resolves deterministically', () => {
  // Spain falls back 2026-10-25: 03:00 -> 02:00, so 02:30 happens twice
  // (once CEST = 00:30Z, once CET = 01:30Z). We resolve to the CET (second,
  // standard-time) occurrence, and it must round-trip back to 02:30.
  const d = parseDatetimeLocal('2026-10-25T02:30');
  assert.ok(d);
  assert.equal(d.toISOString(), '2026-10-25T01:30:00.000Z');
  assert.equal(toDatetimeLocalValue(d), '2026-10-25T02:30');
});

test('rejects malformed input', () => {
  assert.equal(parseDatetimeLocal(''), null);
  assert.equal(parseDatetimeLocal('not-a-date'), null);
  assert.equal(toDatetimeLocalValue(null), '');
});
