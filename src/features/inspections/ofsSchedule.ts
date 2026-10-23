// OFS scheduling (0108): an OFS request's schedule state (ir_ofs_sched_state in the database, mirrored), its chip
// (colors from lib/status only), the one line each side reads, and the fire marshal's schedule split into Needs a time
// and the days. Pure functions, unit-tested in ofsSchedule.test.ts.
import { formatDay } from '../../lib/dates';
import type { StatusKey } from '../../lib/status';
import { clockLabel } from './time';

export type SchedState = 'asked' | 'confirmed' | 'proposed' | 'postponed' | 'done' | 'withdrawn';

interface SchedInput {
  status: string;
  result: string | null;
  ofs_sched: string | null;
}

/** ir_ofs_sched_state: Done, Withdrawn, Postponed, Proposed (OFS picked another time), Confirmed, else Asked. */
export function schedState(r: SchedInput): SchedState {
  if (r.result !== null || r.status === 'complete') return 'done';
  if (r.status === 'withdrawn') return 'withdrawn';
  if (r.status === 'postponed') return 'postponed';
  if (r.ofs_sched === 'proposed' && r.status === 'pending') return 'proposed';
  if (r.status === 'confirmed') return 'confirmed';
  return 'asked';
}

interface Chip {
  status: StatusKey;
  label: string;
}

/** The fire marshal's words: Asked, Confirmed, Moved (waiting on the requester), Postponed, Done. */
export function schedChip(state: SchedState): Chip {
  switch (state) {
    case 'asked':
      return { status: 'pending', label: 'Asked' };
    case 'confirmed':
      return { status: 'confirmed', label: 'Confirmed' };
    case 'proposed':
      return { status: 'assigned', label: 'Moved' };
    case 'postponed':
      return { status: 'postponed', label: 'Postponed' };
    case 'withdrawn':
      return { status: 'cancelled', label: 'Withdrawn' };
    case 'done':
      return { status: 'step_done', label: 'Done' };
  }
}

/** "Tue Oct 27, 9:00 AM", or "Tue Oct 27" for a Flexible one. */
export function whenLabel(date: string, time: string | null): string {
  const day = formatDay(date, 'EEE MMM d');
  return time === null ? day : `${day}, ${clockLabel(time)}`;
}

/** The requester's one line: "Asked for …", "Confirmed for …", "OFS proposed …". Null once it is done or withdrawn. */
export function requesterLine(state: SchedState, date: string, time: string | null): string | null {
  const when = whenLabel(date, time);
  switch (state) {
    case 'asked':
      return `Asked for ${when}`;
    case 'confirmed':
      return `Confirmed for ${when}`;
    case 'proposed':
      return `OFS proposed ${when}`;
    case 'postponed':
      return 'Postponed by OFS';
    default:
      return null;
  }
}

interface ScheduleInput {
  needs_time: boolean;
  request_date: string;
}

/** Needs a time (Asked, no time yet) on top, and the rest by their day. */
export function splitSchedule<T extends ScheduleInput>(rows: readonly T[]): { needsTime: T[]; dated: T[] } {
  return { needsTime: rows.filter((r) => r.needs_time), dated: rows.filter((r) => !r.needs_time) };
}
