// The mock's inspection calendar rows, as ir_calendar_rows makes them (0055): a request in full for the team and for its
// requester, anyone else's as its time, type and color (never one still with the GC); blocked time for everyone, opened
// only by the inspectors. Pure: mock/inspections hands it the stored requests and blocks.
import type { CalendarRow, IrRowRaw } from '../inspections.types';
import { statusKey } from './irRules';

export interface MockBlock {
  id: string;
  version: number;
  project_id: string;
  block_date: string;
  start_time: string | null;
  end_time: string | null;
  repeat_weekly: boolean;
  deleted: boolean;
}

interface Source {
  requests: readonly IrRowRaw[];
  blocks: readonly MockBlock[];
  /** A special kind's name by its id. */
  kindName: (id: string | null) => string | null;
}

interface Range {
  projectId: string;
  /** yyyy-MM-dd, both included. */
  from: string;
  to: string;
}

interface Viewer {
  /** null: nobody (a visitor on the request link). */
  viewer: string | null;
  /** Reads every request in full (the GC team, the inspectors; the deputy on his own rows). */
  team: boolean;
  /** Opens and removes blocked time (ir.decide). */
  decide: boolean;
}

function requestRow(r: IrRowRaw, src: Source, v: Viewer): CalendarRow {
  const mine = v.viewer !== null && r.requested_by === v.viewer;
  const seen = {
    request_date: r.request_date, start_time: r.start_time, duration_kind: r.duration_kind, duration_min: r.duration_min,
    kind: r.kind, status_key: statusKey(r), mine, is_block: false,
  };
  if (!v.team && !mine) {
    return {
      ...seen, id: null, number: null, version: null, full_detail: false, special_kind: null,
      status: r.status === 'complete' ? 'confirmed' : r.status, result: null, attendance: null, company: null, items: null,
      owner_id: null, helper_id: null, postpone_reason: null, postpone_until: null, ofs_sent: false,
    };
  }
  return {
    ...seen, id: r.id, number: r.number, version: r.version, full_detail: true, special_kind: src.kindName(r.special_kind_id),
    status: r.status, result: r.result, attendance: r.attendance, company: r.company, items: r.items, owner_id: r.owner_id,
    helper_id: r.helper_id, postpone_reason: r.postpone_reason, postpone_until: r.postpone_until,
    ofs_sent: r.ofs_sent_at !== null,
  };
}

function blockRow(b: MockBlock, day: string, decide: boolean): CalendarRow {
  const [sh = 0, sm = 0] = (b.start_time ?? '0:0').split(':').map(Number);
  const [eh = 0, em = 0] = (b.end_time ?? '0:0').split(':').map(Number);
  return {
    id: decide ? b.id : null, number: null, version: decide ? b.version : null, full_detail: decide, mine: false, is_block: true,
    request_date: day, start_time: b.start_time, duration_kind: b.start_time === null ? 'all_day' : 'timed',
    duration_min: b.start_time === null ? null : eh * 60 + em - (sh * 60 + sm), kind: 'block', special_kind: null,
    status: 'blocked', status_key: 'blocked', result: null, attendance: null, company: null, items: null, owner_id: null,
    helper_id: null, postpone_reason: null, postpone_until: null, ofs_sent: false,
  };
}

/** Days from `from` to `to` that are the block's day or, when weekly, the same weekday after it. */
function blockDays(b: MockBlock, from: string, to: string): string[] {
  const days: string[] = [];
  for (let d = Date.parse(`${from}T12:00:00Z`); d <= Date.parse(`${to}T12:00:00Z`); d += 86_400_000) {
    const day = new Date(d).toISOString().slice(0, 10);
    const diff = Math.round((Date.parse(`${day}T12:00:00Z`) - Date.parse(`${b.block_date}T12:00:00Z`)) / 86_400_000);
    if (diff === 0 || (b.repeat_weekly && diff > 0 && diff % 7 === 0)) days.push(day);
  }
  return days;
}

export function calendarRows(src: Source, { projectId, from, to }: Range, v: Viewer): CalendarRow[] {
  const rows = src.requests
    .filter((r) => r.project_id === projectId && r.status !== 'withdrawn' && r.request_date >= from && r.request_date <= to)
    .map((r) => requestRow(r, src, v))
    .filter((r) => r.full_detail || !['returned', 'gc_review'].includes(r.status));
  const blocks = src.blocks
    .filter((b) => b.project_id === projectId && !b.deleted)
    .flatMap((b) => blockDays(b, from, to).map((d) => blockRow(b, d, v.decide)));
  return [...rows, ...blocks].sort((a, b) => a.request_date.localeCompare(b.request_date) || (a.start_time ?? '').localeCompare(b.start_time ?? ''));
}
