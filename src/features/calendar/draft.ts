// The add / edit form of a manual line: what a person types (a day and times on the job's clock) <-> what is saved
// (UTC instants). The job's time zone does the converting, through lib/dates.
import type { CalendarLine, CalendarLineFields } from '../../data/calendar.types';
import { MANUAL_KINDS } from '../../lib/calendarKinds';
import { fromZonedInput, toZonedInput } from '../../lib/dates';

export interface LineDraft {
  kind: string;
  title: string;
  /** yyyy-MM-dd on the job's calendar. */
  day: string;
  allDay: boolean;
  /** HH:mm on the job's clock; end may be empty. */
  start: string;
  end: string;
  location: string;
}

const DEFAULT_START = '07:00';

export function newDraft(day: string, kind: string): LineDraft {
  return { kind, title: '', day, allDay: false, start: DEFAULT_START, end: '', location: '' };
}

export function draftOf(line: CalendarLine): LineDraft {
  const start = toZonedInput(line.starts_at, line.timezone);
  const end = line.ends_at === null || line.all_day ? '' : toZonedInput(line.ends_at, line.timezone).slice(11);
  return {
    kind: line.kind,
    title: line.title,
    day: start.slice(0, 10),
    allDay: line.all_day,
    start: line.all_day ? DEFAULT_START : start.slice(11),
    end,
    location: line.location ?? '',
  };
}

function instant(day: string, time: string, tz: string): string {
  const v = fromZonedInput(`${day}T${time}`, tz);
  if (v === null) throw new Error(`Not a time: ${day} ${time}`);
  return v;
}

/** The fields to save, or the one problem to show. */
export function fieldsOf(d: LineDraft, tz: string): CalendarLineFields | { problem: string } {
  const title = d.title.trim();
  const location = d.location.trim();
  if (!(MANUAL_KINDS as readonly string[]).includes(d.kind)) return { problem: 'Pick a type.' };
  if (title === '') return { problem: 'Enter a title.' };
  if (title.length > 300 || location.length > 300) return { problem: 'Keep it under 300 characters.' };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d.day)) return { problem: 'Pick a date.' };
  const base = { kind: d.kind, title, location: location === '' ? null : location };
  if (d.allDay) return { ...base, starts_at: instant(d.day, '00:00', tz), ends_at: null, all_day: true };
  if (!/^\d{2}:\d{2}$/.test(d.start)) return { problem: 'Pick a start time.' };
  if (d.end !== '' && !/^\d{2}:\d{2}$/.test(d.end)) return { problem: 'Pick an end time.' };
  const startsAt = instant(d.day, d.start, tz);
  const endsAt = d.end === '' ? null : instant(d.day, d.end, tz);
  if (endsAt !== null && endsAt < startsAt) return { problem: 'End is before start.' };
  return { ...base, starts_at: startsAt, ends_at: endsAt, all_day: false };
}
