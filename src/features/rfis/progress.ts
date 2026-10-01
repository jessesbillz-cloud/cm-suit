// The route strip's words and looks (Jesse, Sep 30): how long a step sat ("<1d", "5d"), each cell's colors (lib/status
// only), the strips of a job's RFIs by RFI, the due date at the right of a log row (red once late), and why the PDF
// buttons wait. Pure, unit-tested. The days themselves come from the server (rfi_progress, the job's clock).
import type { RfiListRow, RfiProgressRow, RfiRow } from '../../data/rfis.types';
import { formatInZone, todayInZone } from '../../lib/dates';
import type { StatusKey } from '../../lib/status';

/** Whole days on a step, one way everywhere: "<1d" under a day, else "5d". Nothing for steps ahead or the end. */
export function daysLabel(days: number | null): string {
  if (days === null) return '';
  return days === 0 ? '<1d' : `${String(days)}d`;
}

interface CellLook {
  status: StatusKey;
  /** Use the status's solid fill (answered: solid green) instead of its tint. */
  solid: boolean;
  check: boolean;
}

/** Done: a check on the pale tint. Has it now: filled in the accent. Ahead: an outline. Reached the end: solid green. */
export function cellLook(step: Pick<RfiProgressRow, 'kind' | 'state'>): CellLook {
  if (step.state === 'done') {
    return step.kind === 'answered' ? { status: 'confirmed', solid: true, check: true } : { status: 'step_done', solid: false, check: true };
  }
  return step.state === 'current' ? { status: 'step_current', solid: false, check: false } : { status: 'step_ahead', solid: false, check: false };
}

/** The cell's words: its label ("You" when the step that has it now is mine) and its time. */
export function cellText(step: Pick<RfiProgressRow, 'label' | 'state' | 'days'>, mine: boolean): { label: string; time: string } {
  return { label: step.state === 'current' && mine ? 'You' : step.label, time: daysLabel(step.days) };
}

/** Hover words: who, and from when to when on the job's calendar ("Sample PE · Sep 24 to Sep 26", "since Sep 25"). */
export function cellTitle(step: RfiProgressRow, tz: string): string {
  const who = step.person_name ?? step.label;
  if (step.entered_at === null) return who;
  const from = formatInZone(step.entered_at, tz, 'MMM d');
  if (step.kind === 'answered') return `${step.label} ${from}`;
  return step.left_at === null ? `${who} · since ${from}` : `${who} · ${from} to ${formatInZone(step.left_at, tz, 'MMM d')}`;
}

/** The job's steps by RFI, each RFI's in route order. */
export function stripsByRfi(rows: readonly RfiProgressRow[]): Map<string, RfiProgressRow[]> {
  const by = new Map<string, RfiProgressRow[]>();
  for (const r of rows) by.set(r.rfi_id, [...(by.get(r.rfi_id) ?? []), r]);
  for (const steps of by.values()) steps.sort((a, b) => a.position - b.position);
  return by;
}

interface DueMark {
  text: string;
  late: boolean;
}

/** A log row's right side while the architect has it: "Due Oct 3" or "Due today", red once past due. */
export function dueMark(row: Pick<RfiListRow, 'status' | 'due_at'>, tz: string, now: Date): DueMark | null {
  if (row.status !== 'open' || row.due_at === null) return null;
  const day = formatInZone(row.due_at, tz, 'yyyy-MM-dd');
  const text = day === todayInZone(tz, now) ? 'Due today' : `Due ${formatInZone(row.due_at, tz, 'MMM d')}`;
  return { text, late: Date.parse(row.due_at) < now.getTime() };
}

/** Why the PDF buttons wait, or null when the server can make it: nothing to print before it is first sent. */
export function pdfWait(rfi: Pick<RfiRow, 'sent_at' | 'pdf_file_id'>): string | null {
  return rfi.sent_at === null && rfi.pdf_file_id === null ? 'Not sent yet' : null;
}
