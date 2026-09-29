// iCalendar text (RFC 5545) for the calendar feed (SPEC §6.4 #7). One VEVENT per calendar line; UID = the line id.
// Timed lines are UTC DATE-TIMEs; an all-day line is a DATE, the day it falls on in its job's time zone.

export interface IcsLine {
  id: string;
  title: string;
  location: string | null;
  jobName: string;
  /** The job's IANA zone: an all-day line is a day there. */
  timezone: string;
  /** UTC instants (ISO 8601) as the database returns them. */
  startsAt: string;
  endsAt: string | null;
  allDay: boolean;
  /** A lib/status key or null. */
  status: string | null;
  updatedAt: string;
}

const encoder = new TextEncoder();

/** RFC 5545 §3.3.11 TEXT: backslash, semicolon and comma escaped; line breaks become \n. */
export function escapeText(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r\n|\r|\n/g, '\\n');
}

/** RFC 5545 §3.1: a line longer than 75 octets is folded (CRLF + one space), never inside a UTF-8 character. */
export function foldLine(line: string): string {
  const parts: string[] = [];
  let current = '';
  let size = 0;
  let max = 75;
  for (const ch of line) {
    const n = encoder.encode(ch).length;
    if (size + n > max) {
      parts.push(current);
      current = '';
      size = 0;
      max = 74; // a continuation line's leading space counts toward its 75
    }
    current += ch;
    size += n;
  }
  parts.push(current);
  return parts.join('\r\n ');
}

const pad = (n: number): string => String(n).padStart(2, '0');

function instant(iso: string): Date {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) throw new Error(`Not a date: ${iso}`);
  return d;
}

/** A UTC instant as a UTC DATE-TIME: 20261005T140000Z. */
export function utcStamp(iso: string): string {
  const d = instant(iso);
  return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`;
}

/** A DATE (20261005): the day the instant falls on in the zone, plus `offset` days. */
export function localDate(iso: string, tz: string, offset = 0): string {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: tz, year: 'numeric', month: 'numeric', day: 'numeric' })
    .formatToParts(instant(iso));
  const part = (type: string): number => Number(parts.find((p) => p.type === type)?.value);
  const day = new Date(Date.UTC(part('year'), part('month') - 1, part('day') + offset));
  return `${day.getUTCFullYear()}${pad(day.getUTCMonth() + 1)}${pad(day.getUTCDate())}`;
}

function icsStatus(status: string | null): string | null {
  switch (status) {
    case 'cancelled': return 'CANCELLED';
    case 'pending':
    case 'gc_review':
    case 'postponed': return 'TENTATIVE';
    case 'confirmed':
    case 'approved': return 'CONFIRMED';
    default: return null;
  }
}

function vevent(line: IcsLine): string[] {
  const out = ['BEGIN:VEVENT', `UID:${line.id}`, `DTSTAMP:${utcStamp(line.updatedAt)}`];
  if (line.allDay) {
    // DTEND of an all-day event is the day after its last day (exclusive).
    out.push(`DTSTART;VALUE=DATE:${localDate(line.startsAt, line.timezone)}`);
    out.push(`DTEND;VALUE=DATE:${localDate(line.endsAt ?? line.startsAt, line.timezone, 1)}`);
  } else {
    out.push(`DTSTART:${utcStamp(line.startsAt)}`);
    if (line.endsAt) out.push(`DTEND:${utcStamp(line.endsAt)}`);
  }
  out.push(`SUMMARY:${escapeText(`${line.title} (${line.jobName})`)}`);
  if (line.location) out.push(`LOCATION:${escapeText(line.location)}`);
  const status = icsStatus(line.status);
  if (status) out.push(`STATUS:${status}`);
  out.push('END:VEVENT');
  return out;
}

/** The whole feed. Lines end in CRLF, long lines are folded. */
export function buildIcs(calendarName: string, lines: readonly IcsLine[]): string {
  const name = escapeText(calendarName);
  const rows = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    `PRODID:-//${name}//Calendar feed//EN`,
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${name}`,
    // Hints for how often apps refetch (Apple, Outlook).
    'REFRESH-INTERVAL;VALUE=DURATION:PT1H',
    'X-PUBLISHED-TTL:PT1H',
    ...lines.flatMap(vevent),
    'END:VCALENDAR',
  ];
  return `${rows.map(foldLine).join('\r\n')}\r\n`;
}
