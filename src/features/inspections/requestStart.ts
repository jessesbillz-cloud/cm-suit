// What a new request starts with (Jesse, Oct 10: fewer taps, the way My Daily Reports prefills): the day by type (an
// OFS request needs 24 hours notice, so the next working day), and the time and length this person last asked for on
// this job, kept on this device ("app:" key, cleared at sign-out). "File another like this" keeps the time and length
// and moves to the next working day. Storage blocked or unreadable: the defaults (logged, never shown).
import type { IrKind } from '../../data/inspections.types';
import { DEFAULT_DURATION, DURATIONS, FLEXIBLE, TIME_OPTIONS, nextWorkingDay, ofsRequestDay, requestDay, type WhenPick } from './time';

type LastWhen = Pick<WhenPick, 'time' | 'duration'>;

const keyOf = (projectId: string) => `app:ir-when:${projectId}`;

/** A remembered time and length, when both are still offered. */
export function parseLastWhen(raw: string | null): LastWhen | null {
  if (raw === null) return null;
  let v: unknown;
  try {
    v = JSON.parse(raw);
  } catch (e) {
    console.warn('ignoring an unreadable remembered request time', e);
    return null;
  }
  if (typeof v !== 'object' || v === null) return null;
  const { time, duration } = v as Record<string, unknown>;
  if (typeof time !== 'string' || typeof duration !== 'string') return null;
  if (!TIME_OPTIONS.some((o) => o.value === time) || !DURATIONS.some((d) => d.value === duration)) return null;
  return { time, duration };
}

/** The day a request of this type starts on: an OFS one on the next working day, any other on the day looked at. */
export function dayFor(kind: IrKind, selected: string, today: string): string {
  return kind === 'ofs' ? ofsRequestDay(selected, today) : requestDay(selected, today);
}

export function startWhen(kind: IrKind, selected: string, today: string, last: LastWhen | null): WhenPick {
  return { date: dayFor(kind, selected, today), time: last?.time ?? FLEXIBLE, duration: last?.duration ?? DEFAULT_DURATION };
}

/** "File another like this": the same time and length, the next working day after the one just sent. */
export function againWhen(sent: WhenPick): WhenPick {
  return { ...sent, date: nextWorkingDay(sent.date) };
}

export function recallWhen(projectId: string): LastWhen | null {
  try {
    return parseLastWhen(window.localStorage.getItem(keyOf(projectId)));
  } catch (e) {
    console.warn('Device storage is blocked; no remembered request time', e);
    return null;
  }
}

export function rememberWhen(projectId: string, when: WhenPick): void {
  try {
    window.localStorage.setItem(keyOf(projectId), JSON.stringify({ time: when.time, duration: when.duration }));
  } catch (e) {
    console.warn('Device storage is blocked; request time not remembered', e);
  }
}
