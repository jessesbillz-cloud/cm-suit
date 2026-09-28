// `deno test supabase/functions/_shared/ics_test.ts` — the calendar feed's iCalendar text on synthetic lines.
import { buildIcs, escapeText, foldLine, type IcsLine } from './ics.ts';

function check(ok: boolean, what: string): void {
  if (!ok) throw new Error(`failed: ${what}`);
}

const encoder = new TextEncoder();
const unfold = (s: string): string => s.replace(/\r\n /g, '');

const LA = 'America/Los_Angeles';

function line(over: Partial<IcsLine>): IcsLine {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    title: 'Sample slab pour',
    location: null,
    jobName: 'Sample Job A',
    timezone: LA,
    startsAt: '2026-10-05T14:00:00Z',
    endsAt: '2026-10-05T17:00:00Z',
    allDay: false,
    status: null,
    updatedAt: '2026-09-27T12:00:00Z',
    ...over,
  };
}

function eventLines(ics: string): string[] {
  return unfold(ics).split('\r\n');
}

Deno.test('ics: escapes TEXT per RFC 5545', () => {
  check(escapeText('a,b;c\\d\ne') === 'a\\,b\\;c\\\\d\\ne', 'comma, semicolon, backslash and newline escaped');
  check(escapeText('x\r\ny') === 'x\\ny', 'CRLF becomes one \\n');
});

Deno.test('ics: folds long lines at 75 octets, never inside a character', () => {
  for (const text of [`SUMMARY:${'x'.repeat(200)}`, `SUMMARY:${'é'.repeat(100)}`, `SUMMARY:${'漢'.repeat(60)}`]) {
    const folded = foldLine(text);
    check(unfold(folded) === text, 'unfolding gives the original');
    for (const physical of folded.split('\r\n')) {
      check(encoder.encode(physical).length <= 75, `a physical line is at most 75 octets (${physical.length} chars)`);
    }
    check(folded.split('\r\n').slice(1).every((l) => l.startsWith(' ')), 'continuation lines start with a space');
  }
  check(foldLine('SHORT:x') === 'SHORT:x', 'a short line is untouched');
});

Deno.test('ics: calendar frame, CRLF endings, one VEVENT per line with UID = line id', () => {
  const ics = buildIcs('Sample, Calendar', [line({}), line({ id: '22222222-2222-4222-8222-222222222222' })]);
  check(ics.startsWith('BEGIN:VCALENDAR\r\nVERSION:2.0\r\n'), 'starts with the calendar header');
  check(ics.endsWith('END:VCALENDAR\r\n'), 'ends with the calendar footer and CRLF');
  check(!/[^\r]\n/.test(ics), 'every line ends in CRLF');
  const rows = eventLines(ics);
  check(rows.filter((r) => r === 'BEGIN:VEVENT').length === 2, 'two events');
  check(rows.includes('UID:11111111-1111-4111-8111-111111111111'), 'UID is the line id');
  check(rows.includes('X-WR-CALNAME:Sample\\, Calendar'), 'calendar name escaped');
});

Deno.test('ics: a timed line is UTC DATE-TIME', () => {
  const rows = eventLines(buildIcs('Cal', [line({ location: 'Gate 2; north', status: 'cancelled' })]));
  check(rows.includes('DTSTART:20261005T140000Z'), 'start in UTC');
  check(rows.includes('DTEND:20261005T170000Z'), 'end in UTC');
  check(rows.includes('DTSTAMP:20260927T120000Z'), 'stamp in UTC');
  check(rows.includes('SUMMARY:Sample slab pour (Sample Job A)'), 'summary carries the job');
  check(rows.includes('LOCATION:Gate 2\\; north'), 'location escaped');
  check(rows.includes('STATUS:CANCELLED'), 'cancelled status');
  const open = eventLines(buildIcs('Cal', [line({ endsAt: null })]));
  check(!open.some((r) => r.startsWith('DTEND')), 'no end: no DTEND');
});

Deno.test('ics: an all-day line is a DATE in the job zone (Pacific evening, DST change)', () => {
  // 11:30 pm Pacific on Oct 5 is already Oct 6 in UTC; the line belongs to Oct 5 on the job.
  const evening = eventLines(buildIcs('Cal', [line({ allDay: true, startsAt: '2026-10-06T06:30:00Z', endsAt: null })]));
  check(evening.includes('DTSTART;VALUE=DATE:20261005'), 'Pacific evening stays on its local day');
  check(evening.includes('DTEND;VALUE=DATE:20261006'), 'all-day end is the next day');
  // US clocks fall back on Sunday Nov 1, 2026: local midnight is 07:00 UTC, the next local midnight 08:00 UTC.
  const dst = eventLines(buildIcs('Cal', [line({ allDay: true, startsAt: '2026-11-01T07:00:00Z', endsAt: '2026-11-02T08:00:00Z' })]));
  check(dst.includes('DTSTART;VALUE=DATE:20261101'), 'DST day starts on Nov 1');
  check(dst.includes('DTEND;VALUE=DATE:20261103'), 'two-day line ends after Nov 2');
  // Spring forward (Mar 8, 2026): 23:30 local on Mar 8 is 06:30 UTC Mar 9.
  const spring = eventLines(buildIcs('Cal', [line({ allDay: true, startsAt: '2026-03-09T06:30:00Z', endsAt: null })]));
  check(spring.includes('DTSTART;VALUE=DATE:20260308'), 'spring-forward evening stays on Mar 8');
});
