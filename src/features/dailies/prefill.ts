// Filling a report from what the job knows that day (daily_day_facts; CLAUDE.md "prefill anything already known"):
// manpower from the day's safety sign-ins, deliveries, inspection requests, and "Tailgate held: ..." in the safety field.
// Each source goes in once (content.pulled keeps its ref), so a row taken off stays off and nothing typed is replaced: a
// sign-in fills a manpower row's count only while it is empty, and an inspection's result follows the request only while
// it still reads as one of the request's states. Pure, so it is unit-tested.
import type { DayFacts } from '../../data/dailies.types';
import { dailyValues, tablesOf, type DailyContent, type FormTable, type ReportForm, type TableRow } from '../../lib/dailies';
import { formatInZone, fromZonedInput } from '../../lib/dates';
import { requestChip, typeLabel } from '../inspections/model';

interface Day {
  /** The report's day (yyyy-MM-dd) and the job's zone. */
  day: string;
  tz: string;
}

interface SourceRow {
  ref: string;
  cells: Record<string, string>;
}

/** The cells each source fills (a form's table with that source has these columns). */
export const SOURCE_CELLS = {
  signins: ['company', 'trade', 'count'],
  deliveries: ['time', 'company', 'material'],
  inspections: ['time', 'inspection', 'result'],
} as const;

/** Every word an inspection's result can be filled with (the request's states, labeled the one way). */
const RESULT_WORDS = new Set(
  ['gc_review', 'returned', 'pending', 'confirmed', 'postponed', 'complete', 'withdrawn'].flatMap((status) =>
    [null, 'approved', 'not_approved'].flatMap((result) =>
      [null, 'helper'].map((helper) => requestChip({ status, result, helper_id: helper }).label),
    ),
  ),
);

function norm(s: string): string {
  return s.trim().replace(/\s+/g, ' ').toLowerCase();
}

function crewRef(company: string, trade: string): string {
  return `crew:${norm(company)}|${norm(trade)}`.slice(0, 200);
}

/** A wall-clock time of the job's day ("07:30") as people read it ("7:30 AM"). */
function clock(at: Day, hhmm: string): string {
  const instant = fromZonedInput(`${at.day}T${hhmm}`, at.tz);
  return instant === null ? '' : formatInZone(instant, at.tz, 'h:mm a');
}

function sourceRows(table: FormTable, facts: DayFacts, at: Day): SourceRow[] {
  if (table.source === 'signins') {
    return facts.signins.map((g) => ({ ref: crewRef(g.company, g.trade), cells: { company: g.company, trade: g.trade, count: String(g.count) } }));
  }
  if (table.source === 'deliveries') {
    return facts.deliveries.map((d) => ({
      ref: `delivery:${d.id}`,
      cells: {
        time: d.starts_at === null ? 'TBD' : formatInZone(d.starts_at, at.tz, 'h:mm a'),
        company: d.company,
        material: d.standby ? `${d.description} (standby)` : d.description,
      },
    }));
  }
  if (table.source === 'inspections') {
    return facts.inspections.map((r) => ({
      ref: `ir:${r.id}`,
      cells: {
        time: r.start_time === null ? 'Flexible' : clock(at, r.start_time),
        inspection: `${typeLabel(r.kind, r.special)} #${String(r.number)}: ${r.items}`,
        result: requestChip(r).label,
      },
    }));
  }
  return [];
}

/** Each cell no longer than its column allows. */
function fit(table: FormTable, cells: Record<string, string>): Record<string, string> {
  return Object.fromEntries(table.columns.filter((c) => c.key in cells).map((c) => [c.key, (cells[c.key] ?? '').slice(0, c.max)]));
}

/** A row key not yet used in the table. */
function freeKey(rows: readonly TableRow[], want: string): string {
  let key = want.slice(0, 64);
  for (let n = 2; rows.some((r) => r.key === key); n++) key = `${want.slice(0, 56)}~${String(n)}`;
  return key;
}

function sameCrew(row: TableRow, cells: Record<string, string>): boolean {
  return norm(row.cells['company'] ?? '') === norm(cells['company'] ?? '') && norm(row.cells['trade'] ?? '') === norm(cells['trade'] ?? '');
}

interface Merged {
  rows: TableRow[];
  added: string[];
  changed: boolean;
}

function mergeTable(table: FormTable, current: readonly TableRow[], sources: readonly SourceRow[], pulled: ReadonlySet<string>): Merged {
  const rows = [...current];
  const added: string[] = [];
  let changed = false;
  for (const src of sources) {
    const cells = fit(table, src.cells);
    if (pulled.has(src.ref)) {
      // An inspection already filled in: its result follows the request while it still reads as a state.
      const i = table.source === 'inspections' ? rows.findIndex((r) => r.ref === src.ref) : -1;
      const row = rows[i];
      const now = cells['result'] ?? '';
      if (row && RESULT_WORDS.has(row.cells['result'] ?? '') && row.cells['result'] !== now) {
        rows[i] = { ...row, cells: { ...row.cells, result: now } };
        changed = true;
      }
      continue;
    }
    added.push(src.ref);
    if (table.source === 'signins') {
      const i = rows.findIndex((r) => r.ref === src.ref || sameCrew(r, cells));
      const row = rows[i];
      if (row) {
        if ((row.cells['count'] ?? '').trim() === '') {
          rows[i] = { ...row, ref: row.ref ?? src.ref, cells: { ...row.cells, count: cells['count'] ?? '' } };
          changed = true;
        }
        continue;
      }
    }
    rows.push({ key: freeKey(rows, src.ref), ref: src.ref, carry: table.carry === true, cells });
    changed = true;
  }
  return { rows, added, changed };
}

/** The safety lines not yet filled in: "Tailgate held: Heat illness (6 signed in)". */
function safetyLines(facts: DayFacts, pulled: ReadonlySet<string>): SourceRow[] {
  return facts.meetings
    .map((m) => ({
      ref: `safety:${m.id}`,
      cells: { text: `${m.kind === 'tailgate' ? 'Tailgate' : 'Meeting'} held: ${m.title} (${String(m.signed)} signed in)` },
    }))
    .filter((l) => !pulled.has(l.ref));
}

/** The report with the day's facts filled in, or null when there is nothing new. */
export function pullFacts(form: ReportForm, content: DailyContent, facts: DayFacts, at: Day): DailyContent | null {
  const pulled = new Set(content.pulled);
  const added: string[] = [];
  let changed = false;
  const tables = { ...content.tables };
  for (const table of tablesOf(form)) {
    if (table.source === undefined) continue;
    const m = mergeTable(table, tables[table.key] ?? [], sourceRows(table, facts, at), pulled);
    if (m.changed) tables[table.key] = m.rows;
    added.push(...m.added);
    changed = changed || m.changed;
  }
  let fields = content.fields;
  const lines = form.safetyField === undefined ? [] : safetyLines(facts, pulled);
  if (form.safetyField !== undefined && lines.length > 0) {
    const now = (dailyValues(form, content.fields, content.standing_note)[form.safetyField] ?? '').trimEnd();
    fields = { ...fields, [form.safetyField]: [now, ...lines.map((l) => l.cells['text'] ?? '')].filter((s) => s !== '').join('\n') };
    added.push(...lines.map((l) => l.ref));
    changed = true;
  }
  if (!changed && added.length === 0) return null;
  return { ...content, tables, fields, pulled: [...content.pulled, ...added] };
}
