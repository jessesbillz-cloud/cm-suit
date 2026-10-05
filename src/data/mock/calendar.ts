// Mock calendar (e2e only): synthetic lines of several kinds and statuses on the two sample jobs, placed around the
// current week so every view has something, and each job's inspections from the inspections mock (its seeded month).
// Changes live in sessionStorage under their own key.
import { addDays, format, parseISO, startOfWeek } from 'date-fns';
import { fromZonedInput, todayInZone } from '../../lib/dates';
import type { CalendarFeedState, CalendarInspection, CalendarLine, CalendarLineFields, CalendarRange } from '../calendar.types';
import { conflictError, DataError } from '../errors';
import { capability } from './bids';
import { MOCK_PROJECTS } from './fixtures';
import * as mockDeliveries from './deliveries';
import * as mockIr from './inspections';
import { delay } from './store';

const KEY = 'e2e-mock-calendar';

type MockRow = CalendarLine & { deleted: boolean };

interface CalendarMock {
  /** Lines added in this test, and fixture lines as changed in this test (edits, deletes), by id. */
  rows: Record<string, MockRow>;
  count: number;
  feedRotatedAt: string | null;
}

const EMPTY: CalendarMock = { rows: {}, count: 0, feedRotatedAt: null };

function read(): CalendarMock {
  const raw = window.sessionStorage.getItem(KEY);
  return raw === null ? { ...EMPTY } : { ...EMPTY, ...(JSON.parse(raw) as Partial<CalendarMock>) };
}

function write(update: (s: CalendarMock) => CalendarMock): void {
  window.sessionStorage.setItem(KEY, JSON.stringify(update(read())));
}

type Seed = [project: string, kind: string, source: string, title: string, day: number, start: string | null, end: string | null, status: string | null];

// Days count from this week's Monday. Inspections are not here: the calendar reads them from the inspections mock.
const SEEDS: Seed[] = [
  ['job-a', 'deliveries', 'delivery', 'Sample rebar delivery', 1, '07:00', '08:00', 'pending'],
  ['job-a', 'meetings', 'manual', 'Sample OAC meeting', 2, '10:00', '11:00', null],
  ['job-a', 'my_due', 'correction', 'Sample correction due', 2, null, null, 'pending'],
  ['job-a', 'pours', 'manual', 'Sample slab pour', 3, '06:00', '12:00', null],
  ['job-a', 'milestones', 'project_bid_due', 'Bids due', 4, '14:00', null, null],
  ['job-b', 'meetings', 'manual', 'Sample site walk', 1, '13:00', '14:00', null],
  ['job-b', 'deliveries', 'delivery', 'Sample steel delivery', 2, '09:30', null, 'confirmed'],
  ['job-b', 'milestones', 'manual', 'Sample topping out', 3, null, null, null],
  ['job-a', 'meetings', 'manual', 'Sample OAC meeting', -5, '10:00', '11:00', null],
  ['job-a', 'deliveries', 'delivery', 'Sample drywall delivery', -3, '06:30', '07:30', 'confirmed'],
  ['job-b', 'pours', 'manual', 'Sample crane day', -2, null, null, null],
  ['job-a', 'meetings', 'manual', 'Sample OAC meeting', 9, '10:00', '11:00', null],
  ['job-b', 'deliveries', 'delivery', 'Sample glazing delivery', 8, '08:00', null, 'pending'],
  ['job-a', 'milestones', 'manual', 'Sample dry-in', 11, null, null, null],
  // The construction look-ahead: the week's activities per job.
  ['job-a', 'lookahead', 'manual', 'Sample level 2 deck: rebar and embeds', 0, null, null, null],
  ['job-a', 'lookahead', 'manual', 'Sample exterior framing, north side', 1, null, null, null],
  ['job-a', 'lookahead', 'manual', 'Sample underground plumbing, building B', 3, null, null, null],
  ['job-b', 'lookahead', 'manual', 'Sample CMU walls, stair core', 0, null, null, null],
  ['job-b', 'lookahead', 'manual', 'Sample roof deck and fastening', 2, null, null, null],
  ['job-a', 'lookahead', 'manual', 'Sample level 3 deck pour', 7, null, null, null],
  ['job-b', 'lookahead', 'manual', 'Sample fire sprinkler rough-in', 8, null, null, null],
];

function jobOf(projectId: string): { name: string; timezone: string } {
  const p = MOCK_PROJECTS.find((x) => x.project_id === projectId);
  if (!p) throw new DataError('That job no longer exists.', 'P0002', null);
  return { name: p.name, timezone: p.timezone };
}

/** The fixture lines, this week (Monday first) in each job's zone. */
function fixtures(): MockRow[] {
  return SEEDS.map(([project, kind, source, title, offset, start, end, status], i) => {
    const job = jobOf(project);
    const monday = startOfWeek(parseISO(todayInZone(job.timezone)), { weekStartsOn: 1 });
    const day = format(addDays(monday, offset), 'yyyy-MM-dd');
    const n = String(i + 1).padStart(2, '0');
    return {
      id: `cal-${n}`,
      project_id: project,
      kind,
      source_type: source,
      source_id: source === 'manual' ? null : `${source}-${n}`,
      title,
      location: kind === 'meetings' ? 'Sample trailer' : null,
      starts_at: fromZonedInput(`${day}T${start ?? '00:00'}`, job.timezone) ?? '',
      ends_at: end === null ? null : fromZonedInput(`${day}T${end}`, job.timezone),
      all_day: start === null,
      status,
      version: 1,
      project_name: job.name,
      timezone: job.timezone,
      deleted: false,
    };
  });
}

/** The mock's live deliveries on the sample jobs, mirrored as the database does (0025): "{company}: {description}",
 *  Standby = pending, time TBD = an all-day line. */
function deliveryLines(): MockRow[] {
  return mockDeliveries
    .liveRows()
    .filter((d) => MOCK_PROJECTS.some((p) => p.project_id === d.project_id))
    .map((d) => {
      const job = jobOf(d.project_id);
      return {
        id: `cal-${d.id}`,
        project_id: d.project_id,
        kind: 'deliveries',
        source_type: 'delivery',
        source_id: d.id,
        title: `${d.company}: ${d.description}`,
        location: null,
        starts_at: d.starts_at ?? fromZonedInput(`${d.delivery_date}T00:00`, job.timezone) ?? '',
        ends_at: d.starts_at === null ? null : new Date(Date.parse(d.starts_at) + d.duration_min * 60_000).toISOString(),
        all_day: d.starts_at === null,
        status: d.standby ? 'pending' : 'confirmed',
        version: d.version,
        project_name: job.name,
        timezone: job.timezone,
        deleted: false,
      };
    });
}

/** Every line, fixture, mirrored or added, as this test left it (deleted ones included). */
function allRows(): MockRow[] {
  const { rows } = read();
  const base = [...fixtures(), ...deliveryLines()].map((f) => rows[f.id] ?? f);
  return [...base, ...Object.values(rows).filter((r) => !base.some((b) => b.id === r.id))];
}

function toLine({ id, project_id, kind, source_type, source_id, title, location, starts_at, ends_at, all_day, status, version, project_name, timezone }: MockRow): CalendarLine {
  return { id, project_id, kind, source_type, source_id, title, location, starts_at, ends_at, all_day, status, version, project_name, timezone };
}

export async function lines(projectId: string | null, range: CalendarRange): Promise<CalendarLine[]> {
  await delay();
  return allRows()
    .filter((r) => !r.deleted && (projectId === null || r.project_id === projectId) && r.starts_at >= range.from && r.starts_at < range.to)
    .sort((a, b) => a.starts_at.localeCompare(b.starts_at))
    .map(toLine);
}

export async function line(id: string): Promise<CalendarLine | null> {
  await delay();
  const found = allRows().find((r) => r.id === id && !r.deleted);
  return found ? toLine(found) : null;
}

export async function add(projectId: string, fields: CalendarLineFields): Promise<CalendarLine> {
  await delay();
  const job = jobOf(projectId);
  const count = read().count + 1;
  const row: MockRow = {
    ...fields,
    id: `cal-new-${String(count)}`,
    project_id: projectId,
    source_type: 'manual',
    source_id: null,
    status: null,
    version: 1,
    project_name: job.name,
    timezone: job.timezone,
    deleted: false,
  };
  write((s) => ({ ...s, rows: { ...s.rows, [row.id]: row }, count }));
  return toLine(row);
}

/** An edit, a delete or an undo, with the version check the real table has. Returns the saved line. */
export async function change(id: string, version: number, patch: Partial<CalendarLineFields> & { deleted?: boolean }): Promise<CalendarLine> {
  await delay();
  const current = allRows().find((r) => r.id === id);
  if (!current || current.version !== version) throw conflictError();
  const next: MockRow = { ...current, ...patch, version: version + 1 };
  write((s) => ({ ...s, rows: { ...s.rows, [id]: next } }));
  return toLine(next);
}

export async function feed(): Promise<CalendarFeedState> {
  await delay();
  const at = read().feedRotatedAt;
  return at === null ? null : { rotated_at: at };
}

/** A synthetic 43-character token, like the real one's shape. */
export async function rotateFeed(): Promise<string> {
  await delay();
  const count = read().count + 1;
  write((s) => ({ ...s, feedRotatedAt: fromZonedInput(`${todayInZone('UTC')}T12:00`, 'UTC'), count }));
  return `sampleFeedToken${String(count)}`.padEnd(43, 'x');
}

/** A job's inspections for the month view (calendar_inspections): the inspections mock's lines with each request's
 *  attachments and postponements, for people who may see them. The deputy (the OFS pair) gets his OFS requests sent
 *  to OFS and nothing else: no other kind, no blocked time (0061). */
export async function inspections(projectId: string, from: string, to: string): Promise<Omit<CalendarInspection, 'project_id'>[]> {
  // As the database: no inspections for me on a job, no rows (not an error).
  const rights = ['ir.request', 'ir.view_all', 'ir.decide', 'ir.ofs_view', 'ir.ofs_decide'];
  const allowed = await Promise.all(rights.map((cap) => capability(cap)));
  if (!allowed.includes(true)) return [];
  const rows = await mockIr.calendar(projectId, from, to);
  const full = await mockIr.list(projectId, (r) => r.request_date >= from && r.request_date <= to);
  return rows.map((row) => {
    const r = row.is_block ? undefined : full.find((x) => x.id === row.id);
    return { ...row, attachment_ids: r?.attachment_ids ?? [], postpone_count: r?.postpone_count ?? 0 };
  });
}
