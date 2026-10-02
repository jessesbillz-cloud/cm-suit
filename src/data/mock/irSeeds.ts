// Synthetic inspection requests for the e2e mock and the preview (CLAUDE.md rule 8: obviously fake): about seven weeks
// of them on both sample jobs around today, in every state the calendar colors (done, not approved, confirmed, with a
// helper, pending, waiting on the GC, postponed), a few with files, plus blocked time. Placed relative to today so the
// current month is always full. Sample Job A keeps 9:00-10:00 today free (the inspections e2e books it).
import { addDays, format, isWeekend, parseISO } from 'date-fns';
import type { IrRowRaw } from '../inspections.types';
import type { FileRow } from '../types';
import type { MockBlock } from './inspections';
import { SEED_PERMIT_S1 } from './permitSeeds';

const REQUESTER = 'mock-user-sub';
const OWNER = 'mock-user-pm';
const HELPER = 'mock-user-inspector';

const TYPES: readonly [kind: string, special: string | null][] = [
  ['ior', null],
  ['special', 'kind-soils'],
  ['ior', null],
  ['special', 'kind-concrete'],
  ['special', 'kind-welding'],
  ['ior', null],
  ['special', 'kind-anchors'],
  ['ofs', null],
  ['special', 'kind-rebar'],
  ['special', 'kind-masonry'],
];

const COMPANIES = ['Sample Concrete Co', 'Sample Steel Co', 'Sample Framing Co', 'Sample Plumbing Co', 'Sample Masonry Co'];

const ITEMS = [
  'Footings at grid lines 1 to 4',
  'Level 2 deck rebar, grid A to C',
  'Shear wall nailing, east elevation',
  'Moment frame welds, level 1',
  'Underground plumbing test, building B',
  'CMU grout lift 2, stair core',
  'Epoxy anchors at the canopy',
  'Slab on grade vapor barrier and rebar',
  'Roof deck fastening, area 3',
  'In-wall rough-in, level 1 area 1',
  'Compaction under the east pad',
  'Fire sprinkler hydro test, level 2',
];

const TIMES: readonly (string | null)[] = ['07:00', '08:00', '09:30', '13:00', '08:30', null, '10:00', '14:00', '11:00'];
const LENGTHS = [60, 30, 120, 60, 240, 90, 60];
/** Requests a weekday, in turn. */
const COUNTS = [2, 3, 1, 4, 2, 3, 5, 2, 3];
/** Today on Sample Job A: nothing between 9:00 and 10:00. */
const JOB_A_TODAY = ['07:00', '10:00', '13:00', '14:30', '15:00'];

type State = 'done' | 'failed' | 'confirmed' | 'helper' | 'pending' | 'gc' | 'postponed';

function stateFor(offset: number, i: number): State {
  if (offset < 0) return i % 11 === 4 ? 'postponed' : i % 13 === 3 ? 'failed' : offset === -1 && i % 2 === 0 ? 'confirmed' : 'done';
  if (offset === 0) return (['done', 'confirmed', 'pending', 'helper', 'pending'] as const)[i % 5] ?? 'pending';
  if (offset <= 6) return (['pending', 'confirmed', 'pending', 'helper', 'gc', 'confirmed', 'postponed', 'pending'] as const)[i % 8] ?? 'pending';
  return i % 6 === 2 ? 'gc' : 'pending';
}

function fields(state: State, day: string, job: string, number: number, postponedBefore: boolean): Partial<IrRowRaw> {
  const signed = { ir_file_id: `${job}-ir-pdf-${String(number)}`, signed_at: `${day}T22:00:00Z`, signed_by: OWNER, content_hash: 'sample' };
  const later = format(addDays(parseISO(day), 2), 'yyyy-MM-dd');
  switch (state) {
    case 'done':
      return { status: 'complete', result: 'approved', result_note: 'No issues.', result_at: `${day}T20:00:00Z`, owner_id: OWNER,
        attendance: 'alone', postpone_count: postponedBefore ? 1 : 0, ...signed };
    case 'failed':
      return { status: 'confirmed', result: 'not_approved', result_note: 'Sample corrections noted.', result_at: `${day}T20:00:00Z`,
        owner_id: OWNER, attendance: 'be_present' };
    case 'confirmed':
      return { status: 'confirmed', owner_id: OWNER, attendance: number % 2 === 0 ? 'be_present' : null };
    case 'helper':
      return { status: 'confirmed', owner_id: OWNER, helper_id: HELPER };
    case 'gc':
      return { status: 'gc_review' };
    case 'postponed':
      return { status: 'postponed', owner_id: OWNER, postpone_reason: number % 2 === 0 ? 'weather' : 'not_ready',
        postpone_until: later, postponed_at: `${day}T15:00:00Z`, postpone_count: 1 };
    case 'pending':
      return { status: 'pending' };
  }
}

interface Slot {
  time: string | null;
  length: number;
}

function row(job: string, day: string, number: number, i: number, { time, length }: Slot, state: State): IrRowRaw {
  const [kind, special] = TYPES[i % TYPES.length] ?? (['ior', null] as const);
  const at = `${day}T14:00:00Z`;
  const files = i % 4 === 1 ? [`${job}-ir-file-${String((i % 3) + 1)}`] : i % 4 === 3 && i % 3 === 0 ? [`${job}-ir-file-1`, `${job}-ir-file-2`] : [];
  return {
    id: `mock-ir-${job}-${String(number)}`, project_id: job, org_id: 'org-sample', number, version: 1, requested_by: REQUESTER,
    created_by: REQUESTER, created_at: at, updated_at: at, deleted_at: null, company: COMPANIES[i % COMPANIES.length] ?? '',
    request_date: day, start_time: time, duration_kind: time === null ? 'periodic' : 'timed', duration_min: time === null ? null : length,
    kind, special_kind_id: kind === 'special' ? special : null, items: ITEMS[i % ITEMS.length] ?? '', attachment_ids: files,
    notice_ack_at: at, status: 'pending', gc_by: null, gc_at: null, gc_note: null, owner_id: null, helper_id: null,
    confirm_note: null, attendance: null, result: null, result_note: null, result_photo_ids: [], result_at: null, result_by: null,
    helper_report: null, helper_note: null, helper_at: null, postpone_reason: null, postpone_note: null, postpone_until: null,
    postponed_at: null, postpone_count: 0, ir_file_id: null, content_hash: null, signed_at: null, signed_by: null,
    pdf_stale: false, pdf_postponed: false, results_sent_at: null, summary: null, permit_id: null,
    requester_name: null, requester_phone: null, requester_email: null,
    ...fields(state, day, job, number, i % 11 === 5),
  };
}

/** The seeded requests of both sample jobs around `today`, numbered per job in date order after `firstNumber`. */
export function seedRequests(today: string, firstNumber: Record<string, number>): IrRowRaw[] {
  const out: IrRowRaw[] = [];
  ['job-a', 'job-b'].forEach((job, j) => {
    let number = firstNumber[job] ?? 1;
    let i = j * 3;
    for (let offset = -27; offset <= 20; offset += 1) {
      const date = addDays(parseISO(today), offset);
      if (isWeekend(date)) continue;
      const day = format(date, 'yyyy-MM-dd');
      const count = COUNTS[(offset + 40 + j * 4) % COUNTS.length] ?? 2;
      for (let k = 0; k < count; k += 1) {
        const slot: Slot =
          job === 'job-a' && offset === 0
            ? { time: JOB_A_TODAY[k] ?? '15:30', length: 60 }
            : { time: TIMES[(i + k * 2) % TIMES.length] ?? null, length: LENGTHS[i % LENGTHS.length] ?? 60 };
        out.push(row(job, day, number, i, slot, stateFor(offset, i)));
        number += 1;
        i += 1;
      }
    }
  });
  return out;
}

/**
 * The fire marshal's inspections on Sample Science Building (the permits mock): an underground hydro done a month ago
 * and a sprinkler hydro confirmed for this week, both for permit 24-0001; two more requested and not linked yet.
 */
export function permitJobRequests(today: string): IrRowRaw[] {
  const on = (n: number) => format(addDays(parseISO(today), n), 'yyyy-MM-dd');
  const seeds: [offset: number, state: State, items: string, permit: string | null][] = [
    [-30, 'done', 'Underground fire service hydro and flush', SEED_PERMIT_S1],
    [3, 'confirmed', 'Sprinkler hydro, levels 1 and 2', SEED_PERMIT_S1],
    [6, 'pending', 'Fire alarm device test, level 1', null],
    [8, 'pending', 'Fire doors and dampers, level 2', null],
  ];
  // TYPES[7] is the OFS kind.
  return seeds.map(([offset, state, items, permit], k) => ({
    ...row('job-s', on(offset), k + 1, 7, { time: '09:00', length: 120 }, state),
    items,
    permit_id: permit,
  }));
}

/** Blocked time: a weekly lunch hour on Sample Job A (today's weekday, from two weeks back) and one morning on B. */
export function seedBlocks(today: string): MockBlock[] {
  const back = (n: number) => format(addDays(parseISO(today), n), 'yyyy-MM-dd');
  return [
    { id: 'mock-block-seed-1', version: 1, project_id: 'job-a', block_date: back(-14), start_time: '12:00', end_time: '13:00', repeat_weekly: true, deleted: false },
    { id: 'mock-block-seed-2', version: 1, project_id: 'job-b', block_date: back(3), start_time: '07:00', end_time: '09:00', repeat_weekly: false, deleted: false },
  ];
}

function attachment(job: string, n: number, name: string, mime: string): FileRow {
  return {
    id: `${job}-ir-file-${String(n)}`, project_id: job, folder_id: `${job}-inspection-requests`, original_name: name, mime,
    size: 120_000 + n * 7_000, scan_status: 'clean', upload_complete: true, created_at: '2026-09-01T16:00:00Z', created_by: REQUESTER,
  };
}

/** The files the seeded requests carry (names only: downloads are server-only). */
export const IR_SEED_FILES: FileRow[] = ['job-a', 'job-b'].flatMap((job) => [
  attachment(job, 1, 'Sample layout sheet.pdf', 'application/pdf'),
  attachment(job, 2, 'Sample field photo.jpg', 'image/jpeg'),
  attachment(job, 3, 'Sample mix design.pdf', 'application/pdf'),
]);
