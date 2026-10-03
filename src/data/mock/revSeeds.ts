// Synthetic revs for the e2e mock and the preview (CLAUDE.md rule 8: obviously fake) on Sample Science Building (the
// permit jobs' OFS job): one list with the eight revs of a fire marshal job (synthetic trades), six walls on Level 01
// and Level 02, two N/A marks, and three OFS requests around today: TOW passed and signed, HOW cavity with one wall
// failed, and CJ requested with a map the requester drew. Placed relative to today like the other inspection seeds.
import { addDays, format, parseISO } from 'date-fns';
import type { Tables } from '../database.types';
import type { IrRowRaw } from '../inspections.types';

const REVS_JOB = 'job-s';
const ORG = 'org-owner';
const AT = '2026-09-01T16:00:00Z';
const SETUP_BY = 'mock-user-inspector';
const REQUESTER = 'mock-user-sub';
const INSPECTOR = 'mock-user-inspector';
const FIRESTOP = 'Sample Firestop Co';
const DRYWALL = 'Sample Drywall Co';

type Legend = [number: number, name: string, items: [name: string, company: string | null][]][];

const LEGEND: Legend = [
  [0, 'TOW', [['TOW - Speed Plugs', FIRESTOP]]],
  [1, 'HOW - Cavity', [['HOW Cavity Stuff', FIRESTOP], ['HOW Cavity Spray', FIRESTOP], ['HOW Beam Pockets', FIRESTOP]]],
  [2, 'CJ', [['CJ Stuffing', FIRESTOP], ['CJ Caulking', FIRESTOP]]],
  [3, 'Drywall', [
    ['First Side - First Layer', DRYWALL], ['First Side - Second Layer', DRYWALL], ['First Side - Fire Tape', DRYWALL],
    ['Second Side - First Layer', DRYWALL], ['Second Side - Second Layer', DRYWALL], ['Second Side - Fire Tape', DRYWALL],
  ]],
  [4, 'In-Wall', [
    ['In-Wall Electrical', 'Sample Electric Co'], ['In-Wall Plumbing', 'Sample Plumbing Co'],
    ['In-Wall HVAC Controls', 'Sample Controls Co'], ['In-Wall Mechanical', 'Sample Mechanical Co'],
  ]],
  [5, 'In-Wall Final', [['In-Wall Final - OK to Cover - Slab firestopping/putty pads', null]]],
  [6, 'HOW - Surface', [['HOW Surface Stuff', FIRESTOP], ['HOW Surface Spray', FIRESTOP], ['BOX Caulking', FIRESTOP]]],
  [7, 'Final', [['Final - OK to Cover - All firestopping/fireproofing', null]]],
];

const WALLS: [level: string, name: string, sheet: string][] = [
  ['Level 01', 'Shaftwall at Stair 2 (C–D / 3–4)', 'job-s-plan-a101'],
  ['Level 01', 'Corridor 110 north wall (B / 2–5)', 'job-s-plan-a101'],
  ['Level 01', 'Elevator 1 shaft (E / 1–2)', 'job-s-plan-a101'],
  ['Level 02', 'Shaftwall at Stair 2 (C–D / 3–4)', 'job-s-plan-a102'],
  ['Level 02', 'Corridor 210 north wall (B / 2–5)', 'job-s-plan-a102'],
  ['Level 02', 'Electrical 205 east wall (D / 4)', 'job-s-plan-a102'],
];

const LIST_ID = 'mock-rev-list-1';
const base = { project_id: REVS_JOB, org_id: ORG, created_at: AT, updated_at: AT, created_by: SETUP_BY, version: 1, deleted_at: null };

const itemId = (rev: number, k: number) => `mock-rev-item-${String(rev)}-${String(k)}`;
const areaId = (n: number) => `mock-rev-area-${String(n)}`;

export function seedSetup() {
  const lists: Tables<'rev_lists'>[] = [{ ...base, id: LIST_ID, name: 'Sample Rated Walls', phase: 'PH III', permit_id: null, position: 1 }];
  const revs: Tables<'revs'>[] = LEGEND.map(([n, name]) => ({ ...base, id: `mock-rev-${String(n)}`, list_id: LIST_ID, number: n, name }));
  const items: Tables<'rev_items'>[] = LEGEND.flatMap(([n, , list]) =>
    list.map(([name, company], k) => ({ ...base, id: itemId(n, k + 1), rev_id: `mock-rev-${String(n)}`, name, company, position: k + 1 })),
  );
  const areas: Tables<'rev_areas'>[] = WALLS.map(([level, name, sheet], i) => ({
    ...base, id: areaId(i + 1), list_id: LIST_ID, level, name, sheet_file_id: sheet, position: i + 1,
  }));
  const marks: Tables<'rev_marks'>[] = [
    { ...base, id: 'mock-rev-mark-1', area_id: areaId(6), item_id: itemId(4, 2), kind: 'na' },
    { ...base, id: 'mock-rev-mark-2', area_id: areaId(3), item_id: itemId(6, 3), kind: 'na' },
  ];
  return { lists, revs, items, areas, marks };
}

type CellSeed = [request: number, area: number, rev: number, item: number, color: number, result: 'passed' | 'failed' | null, note?: string];

const FAIL_NOTE = 'Sample gaps at the deflection track';

const CELLS: CellSeed[] = [
  [5, 1, 0, 1, 1, 'passed'], [5, 2, 0, 1, 1, 'passed'], [5, 3, 0, 1, 1, 'passed'],
  [6, 1, 1, 1, 1, 'passed'], [6, 1, 1, 2, 2, 'passed'], [6, 2, 1, 1, 1, 'passed'], [6, 2, 1, 2, 2, 'failed', FAIL_NOTE],
  [7, 4, 2, 1, 1, null], [7, 4, 2, 2, 2, null], [7, 5, 2, 1, 1, null], [7, 5, 2, 2, 2, null],
];

const revRequestId = (n: number) => `mock-ir-revs-${String(n)}`;

export function seedCells(): Tables<'ir_rev_items'>[] {
  return CELLS.map(([req, area, rev, item, color, result, note], i) => ({
    id: `mock-ir-rev-item-${String(i + 1)}`, created_at: AT, updated_at: AT, created_by: REQUESTER, version: 1, org_id: ORG,
    project_id: REVS_JOB, request_id: revRequestId(req), area_id: areaId(area), item_id: itemId(rev, item), color, result,
    result_note: note ?? null, result_at: result === null ? null : AT, result_by: result === null ? null : INSPECTOR,
  }));
}

const STROKE_TOW = { c: 1, w: 0.012, p: [[0.18, 0.22], [0.18, 0.41]] };
const STROKES_HOW = [{ c: 1, w: 0.012, p: [[0.18, 0.22], [0.18, 0.41]] }, { c: 2, w: 0.012, p: [[0.3, 0.6], [0.52, 0.6]] }];
const STROKES_CJ = [
  { c: 1, w: 0.01, p: [[0.21, 0.24], [0.21, 0.31], [0.21, 0.4]] },
  { c: 2, w: 0.01, p: [[0.33, 0.58], [0.45, 0.58], [0.56, 0.58]] },
];

function map(req: number, sheet: string, strokes: unknown[], rendered: boolean, signed: boolean): Tables<'ir_maps'> {
  return {
    request_id: revRequestId(req), org_id: ORG, project_id: REVS_JOB, created_at: AT, updated_at: AT,
    updated_by: REQUESTER, version: 2, sheet_file_id: sheet, page: 1, strokes: strokes as Tables<'ir_maps'>['strokes'],
    map_file_id: rendered ? `mock-ir-map-${String(req)}` : null, content_hash: rendered ? 'sample' : null, signed, stale: !rendered,
  };
}

export function seedMaps(): Tables<'ir_maps'>[] {
  return [
    map(5, 'job-s-plan-a101', [STROKE_TOW], true, true),
    map(6, 'job-s-plan-a101', STROKES_HOW, true, false),
    map(7, 'job-s-plan-a102', STROKES_CJ, false, false),
  ];
}

type ReqSeed = [n: number, offset: number, items: string, state: 'approved' | 'failed' | 'pending'];

const REQUESTS: ReqSeed[] = [
  [5, -12, 'Level 01 · TOW - Speed Plugs · Shaftwall at Stair 2 (C–D / 3–4), Corridor 110 north wall (B / 2–5), Elevator 1 shaft (E / 1–2)', 'approved'],
  [6, -5, 'Level 01 · HOW Cavity Stuff & HOW Cavity Spray · Shaftwall at Stair 2 (C–D / 3–4), Corridor 110 north wall (B / 2–5)', 'failed'],
  [7, 2, 'Level 02 · CJ Stuffing & CJ Caulking · Shaftwall at Stair 2 (C–D / 3–4), Corridor 210 north wall (B / 2–5)', 'pending'],
];

/** The three revs requests as inspection requests of Sample Science Building (IR and OFS IR 5 to 7). */
export function revsJobRequests(today: string): IrRowRaw[] {
  return REQUESTS.map(([n, offset, items, state]) => {
    const day = format(addDays(parseISO(today), offset), 'yyyy-MM-dd');
    const done = state !== 'pending';
    const at = `${day}T21:00:00Z`;
    return {
      id: revRequestId(n), project_id: REVS_JOB, org_id: ORG, number: n, ofs_number: n, version: 3, requested_by: REQUESTER,
      created_by: REQUESTER, created_at: AT, updated_at: AT, deleted_at: null, company: FIRESTOP, request_date: day,
      start_time: '09:00', duration_kind: 'timed', duration_min: 60, kind: 'ofs', special_kind_id: null, items,
      attachment_ids: [], notice_ack_at: AT, status: state === 'approved' ? 'complete' : done ? 'confirmed' : 'pending',
      gc_by: null, gc_at: null, gc_note: null, owner_id: done ? INSPECTOR : null, helper_id: null, confirm_note: null,
      attendance: null, result: state === 'approved' ? 'approved' : done ? 'not_approved' : null,
      result_note: state === 'failed' ? `Corridor 110 north wall (B / 2–5) · HOW Cavity Spray: ${FAIL_NOTE}` : null,
      result_photo_ids: [], result_at: done ? at : null, result_by: done ? INSPECTOR : null, helper_report: null,
      helper_note: null, helper_at: null, postpone_reason: null, postpone_note: null, postpone_until: null, postponed_at: null,
      postpone_count: 0, ir_file_id: state === 'approved' ? `mock-ir-pdf-revs-${String(n)}` : null,
      content_hash: state === 'approved' ? 'sample' : null, signed_at: state === 'approved' ? at : null,
      signed_by: state === 'approved' ? INSPECTOR : null, pdf_stale: false, pdf_postponed: false, results_sent_at: null,
      summary: null, permit_id: null, requester_name: null, requester_phone: null, requester_email: null,
    };
  });
}
