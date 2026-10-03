// `deno test supabase/functions/_shared/schedule/xer_test.ts` — the P6 XER reader on a small synthetic export.
import { decodeText, looksLikeXer, readXer, xerSchedule } from './xer.ts';

function check(ok: boolean, what: string): void {
  if (!ok) throw new Error(`failed: ${what}`);
}

function same(a: unknown, b: unknown, what: string): void {
  check(JSON.stringify(a) === JSON.stringify(b), `${what}: ${JSON.stringify(a)} !== ${JSON.stringify(b)}`);
}

const t = (...cells: string[]) => cells.join('\t');

// A synthetic export: the job's project and a baseline copy, two calendars (8 and 10 hours a day), the WBS tree,
// activities of every type, two relationships and three activity code types (one of them not used).
const TASK_FIELDS = ['task_id', 'proj_id', 'wbs_id', 'clndr_id', 'phys_complete_pct', 'complete_pct_type', 'task_type',
  'status_code', 'task_code', 'task_name', 'remain_drtn_hr_cnt', 'target_drtn_hr_cnt', 'act_start_date', 'act_end_date',
  'early_start_date', 'early_end_date', 'restart_date', 'reend_date', 'target_start_date', 'target_end_date'];
const XER = [
  t('ERMHDR', '19.12', '2026-10-01', 'Project', 'admin', 'Sample Admin', 'dbxDatabaseNoName', 'Project Management', 'USD'),
  t('%T', 'PROJECT'),
  t('%F', 'proj_id', 'proj_short_name', 'last_recalc_date', 'plan_start_date'),
  t('%R', '1001', 'S-100', '2026-10-01 00:00', '2026-06-01 00:00'),
  t('%R', '1002', 'S-100-BL', '2026-06-01 00:00', '2026-06-01 00:00'),
  t('%T', 'CALENDAR'),
  t('%F', 'clndr_id', 'clndr_name', 'day_hr_cnt'),
  t('%R', '1', 'Sample 5-day', '8'),
  t('%R', '2', 'Sample 4x10', '10'),
  t('%T', 'PROJWBS'),
  t('%F', 'wbs_id', 'proj_id', 'parent_wbs_id', 'proj_node_flag', 'wbs_short_name', 'wbs_name'),
  t('%R', '10', '1001', '', 'Y', 'S-100', 'Sample Office Building'),
  t('%R', '11', '1001', '10', 'N', 'A', 'Building A'),
  t('%R', '12', '1001', '11', 'N', 'L2', 'Level 2'),
  t('%R', '13', '1001', '10', 'N', 'MS', 'Milestones'),
  t('%T', 'TASK'),
  t('%F', ...TASK_FIELDS),
  t('%R', '100', '1001', '12', '1', '0', 'CP_Drtn', 'TT_Task', 'TK_Active', 'A2010', 'Hang drywall, Level 2 east', '24', '64',
    '2026-09-24 07:00', '', '2026-09-24 07:00', '2026-10-05 15:00', '2026-10-02 07:00', '2026-10-05 15:00', '2026-09-22', '2026-10-01'),
  t('%R', '101', '1001', '12', '2', '0', 'CP_Drtn', 'TT_Task', 'TK_NotStart', 'A2020', 'Tape and finish drywall', '60', '60',
    '', '', '2026-10-06 07:00', '2026-10-13 17:00', '2026-10-06 07:00', '2026-10-13 17:00', '2026-10-02', '2026-10-09'),
  t('%R', '102', '1001', '13', '1', '0', 'CP_Drtn', 'TT_FinMile', 'TK_NotStart', 'M900', 'Building dry-in', '0', '0',
    '', '', '2026-10-16 17:00', '2026-10-16 17:00', '', '2026-10-16 17:00', '', ''),
  t('%R', '103', '1001', '11', '1', '0', 'CP_Drtn', 'TT_LOE', 'TK_Active', 'L001', 'General conditions', '800', '2000',
    '2026-06-01 07:00', '', '', '', '', '', '', ''),
  t('%R', '104', '1001', '11', '1', '100', 'CP_Drtn', 'TT_Task', 'TK_Complete', 'A1000', 'Pour level 2 deck', '0', '16',
    '2026-09-01 07:00', '2026-09-02 15:00', '', '', '', '', '', ''),
  t('%R', '105', '1001', '12', '1', '30', 'CP_Phys', 'TT_Task', 'TK_Active', 'A2030', 'Fire sprinkler drops, Level 2', '40', '40',
    '2026-09-30 07:00', '', '', '', '2026-10-01 07:00', '2026-10-07 15:00', '', ''),
  t('%R', '200', '1002', '12', '1', '0', 'CP_Drtn', 'TT_Task', 'TK_NotStart', 'A2010', 'Hang drywall (baseline)', '64', '64',
    '', '', '', '', '', '', '2026-09-22', '2026-10-01'),
  t('%T', 'TASKPRED'),
  t('%F', 'task_pred_id', 'task_id', 'pred_task_id', 'proj_id', 'pred_proj_id', 'pred_type', 'lag_hr_cnt'),
  t('%R', '1', '101', '100', '1001', '1001', 'PR_SS', '20'),
  t('%R', '2', '102', '101', '1001', '1001', 'PR_FS', '0'),
  t('%T', 'ACTVTYPE'),
  t('%F', 'actv_code_type_id', 'actv_code_type', 'proj_id'),
  t('%R', '500', 'Responsibility', '1001'),
  t('%R', '501', 'Area', '1001'),
  t('%R', '502', 'Phase', '1001'),
  t('%T', 'ACTVCODE'),
  t('%F', 'actv_code_id', 'actv_code_type_id', 'short_name', 'actv_code_name'),
  t('%R', '600', '500', 'DRY', 'Sample Drywall Co'),
  t('%R', '601', '501', 'L2E', 'Level 2 East'),
  t('%R', '602', '502', 'P1', 'Phase 1'),
  t('%T', 'TASKACTV'),
  t('%F', 'task_id', 'actv_code_type_id', 'actv_code_id', 'proj_id'),
  t('%R', '100', '500', '600', '1001'),
  t('%R', '100', '501', '601', '1001'),
  t('%R', '100', '502', '602', '1001'),
  '%E',
].join('\r\n');

Deno.test('readXer: tables by name, fields zipped with values', () => {
  const tables = readXer(XER);
  same([...tables.keys()], ['PROJECT', 'CALENDAR', 'PROJWBS', 'TASK', 'TASKPRED', 'ACTVTYPE', 'ACTVCODE', 'TASKACTV'], 'tables');
  same(tables.get('PROJECT')?.rows[0]?.['proj_short_name'], 'S-100', 'a value');
  same(tables.get('TASK')?.rows.length, 7, 'rows');
  const short = readXer([t('%T', 'X'), t('%F', 'a', 'b', 'c'), t('%R', '1'), '%E'].join('\n'));
  same(short.get('X')?.rows[0], { a: '1', b: '', c: '' }, 'a short row gets blanks');
  check(looksLikeXer(XER) && !looksLikeXer('<Project>'), 'detected by its ERMHDR line');
});

Deno.test('xerSchedule: the main project, its name and data date', () => {
  const s = xerSchedule(XER);
  same(s.title, 'Sample Office Building', 'title from the project node');
  same(s.dataDate, '2026-10-01', 'data date = last_recalc_date');
  same(s.rows.map((r) => r.code), ['A2010', 'A2020', 'M900', 'A1000', 'A2030'], 'activities in file order, baseline and LOE left out');
  same(s.warnings, ['1 level-of-effort or summary activity left out.'], 'the LOE is told');
});

Deno.test('xerSchedule: dates, percent, WBS path and activity codes', () => {
  const rows = new Map(xerSchedule(XER).rows.map((r) => [r.code, r]));
  const a = rows.get('A2010');
  same([a?.start, a?.finish, a?.actual_start, a?.actual_finish], ['2026-09-24', '2026-10-05', '2026-09-24', null], 'underway: actual start, remaining finish');
  same(a?.percent, 62.5, 'duration % complete from the hours (1 - 24/64)');
  same([a?.wbs, a?.trade, a?.area, a?.csi_division], ['Building A / Level 2', 'Sample Drywall Co', 'Level 2 East', null], 'WBS path and codes');
  const b = rows.get('A2020');
  same([b?.start, b?.finish, b?.percent, b?.is_milestone], ['2026-10-06', '2026-10-13', 0, false], 'not started: remaining dates');
  const m = rows.get('M900');
  same([m?.start, m?.finish, m?.is_milestone, m?.wbs], ['2026-10-16', '2026-10-16', true, 'Milestones'], 'a finish milestone');
  const done = rows.get('A1000');
  same([done?.start, done?.finish, done?.actual_finish, done?.percent], ['2026-09-01', '2026-09-02', '2026-09-02', 100], 'complete');
  same(rows.get('A2030')?.percent, 30, 'physical % complete when the activity is set to it');
  same(a?.source_ref, 'row 1', 'where it came from');
});

Deno.test('xerSchedule: relationships, lag in days of the activity\'s calendar', () => {
  same(xerSchedule(XER).relationships, [
    { pred: 'A2010', succ: 'A2020', type: 'SS', lagDays: 2 },
    { pred: 'A2020', succ: 'M900', type: 'FS', lagDays: 0 },
  ], '20 hours on a 10-hour calendar is 2 days');
});

Deno.test('xerSchedule: a file with no project says so', () => {
  const s = xerSchedule(t('ERMHDR', '19.12'));
  same([s.rows.length, s.warnings], [0, ['No project in this XER.']], 'nothing');
});

Deno.test('decodeText: UTF-8, else Windows-1252; the BOM comes off', () => {
  same(decodeText(new Uint8Array([0xef, 0xbb, 0xbf, 0x41, 0xc3, 0xa9])), 'Aé', 'UTF-8 with a BOM');
  same(decodeText(new Uint8Array([0x43, 0x61, 0x66, 0xe9, 0x20, 0x96])), 'Café –', 'Windows-1252');
});
