// Primavera P6 XER, read without P6 (research §2.1, Oracle's XER Import/Export Data Map). An XER is tab-separated text:
// ERMHDR (the export's header), then per table "%T <TABLE>", "%F <field>...", "%R <value>..." lines, and "%E" at the end.
// Read: PROJECT (name, data date = last_recalc_date), PROJWBS (the WBS tree: each activity's path), CALENDAR (hours per
// day), TASK (the activities), ACTVTYPE / ACTVCODE / TASKACTV (activity codes: responsibility -> trade, area / location
// -> area, CSI -> division) and TASKPRED (relationships, lag in days). Durations and lags are in hours: divided by the
// activity's calendar hours per day (8 when the calendar doesn't say). Level-of-effort and WBS-summary activities are
// not activities of the look-ahead and are left out. Pure: no I/O.
import { emptyRow, looseDay, type ParsedSchedule, type ScheduleRow } from './rows.ts';

export interface XerTable {
  fields: string[];
  rows: Record<string, string>[];
}

export interface XerRelationship {
  /** Activity IDs (task_code). */
  pred: string;
  succ: string;
  /** FS, SS, FF or SF. */
  type: string;
  lagDays: number;
}

export interface XerSchedule extends ParsedSchedule {
  relationships: XerRelationship[];
}

/** UTF-8 when the bytes are UTF-8, else Windows-1252 (what P6 writes on most desktops). A byte-order mark comes off. */
export function decodeText(bytes: Uint8Array): string {
  let text: string;
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch (e) {
    if (!(e instanceof TypeError)) throw e;
    text = new TextDecoder('windows-1252').decode(bytes);
  }
  return text.replace(/^﻿/, '');
}

/** Every table in the file by name. Rows shorter than their %F line get '' for the missing fields. */
export function readXer(text: string): Map<string, XerTable> {
  const tables = new Map<string, XerTable>();
  let current: XerTable | null = null;
  for (const raw of text.split('\n')) {
    const line = raw.replace(/\r$/, '');
    const cells = line.split('\t');
    const tag = cells[0];
    if (tag === '%T') {
      const name = (cells[1] ?? '').trim();
      current = tables.get(name) ?? { fields: [], rows: [] };
      tables.set(name, current);
    } else if (tag === '%F' && current) {
      current.fields = cells.slice(1).map((f) => f.trim());
    } else if (tag === '%R' && current) {
      const row: Record<string, string> = {};
      current.fields.forEach((f, i) => {
        row[f] = cells[i + 1] ?? '';
      });
      current.rows.push(row);
    } else if (tag === '%E') {
      break;
    }
  }
  return tables;
}

/** True when the text starts like an XER (the ERMHDR line). */
export function looksLikeXer(text: string): boolean {
  return /^﻿?ERMHDR\t/.test(text);
}

function num(v: string | undefined): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function day(v: string | undefined): string | null {
  return v ? looseDay(v).day : null;
}

const KEEP_TYPES = new Set(['TT_Task', 'TT_Rsrc', 'TT_Mile', 'TT_FinMile']);
const PRED_TYPES: Record<string, string> = { PR_FS: 'FS', PR_SS: 'SS', PR_FF: 'FF', PR_SF: 'SF' };

type CodeUse = 'trade' | 'area' | 'csi';

/** Which column an activity code type feeds, by its name ("Responsibility", "Area", "CSI Section" ...). */
function codeUse(typeName: string): CodeUse | null {
  if (/csi|spec\b|specification|division|masterformat/i.test(typeName)) return 'csi';
  if (/respons|sub\b|subcontract|trade|company|contractor|crew/i.test(typeName)) return 'trade';
  if (/area|location|floor|level|zone|building|bldg/i.test(typeName)) return 'area';
  return null;
}

/** The project in the file with the most activities (an XER may carry a baseline project too). */
function mainProject(tables: Map<string, XerTable>): Record<string, string> | null {
  const projects = tables.get('PROJECT')?.rows ?? [];
  const tasks = tables.get('TASK')?.rows ?? [];
  let best: Record<string, string> | null = null;
  let bestCount = -1;
  for (const p of projects) {
    const n = tasks.filter((t) => t['proj_id'] === p['proj_id']).length;
    if (n > bestCount) {
      best = p;
      bestCount = n;
    }
  }
  return best;
}

/** wbs_id -> "Building A / Level 2" (from below the project's own node down to the activity's WBS). */
function wbsPaths(rows: readonly Record<string, string>[]): { path: (id: string) => string | null; projectName: string | null } {
  const byId = new Map(rows.map((r) => [r['wbs_id'] ?? '', r]));
  const memo = new Map<string, string | null>();
  const path = (id: string): string | null => {
    if (memo.has(id)) return memo.get(id) ?? null;
    const names: string[] = [];
    let cur = byId.get(id);
    for (let guard = 0; cur && guard < 50; guard += 1) {
      if (cur['proj_node_flag'] === 'Y') break;
      const name = (cur['wbs_name'] || cur['wbs_short_name'] || '').trim();
      if (name) names.unshift(name);
      cur = byId.get(cur['parent_wbs_id'] ?? '');
    }
    const out = names.length ? names.join(' / ') : null;
    memo.set(id, out);
    return out;
  };
  const node = rows.find((r) => r['proj_node_flag'] === 'Y');
  return { path, projectName: node ? (node['wbs_name'] || node['wbs_short_name'] || '').trim() || null : null };
}

/** P6's own "% complete": physical when the activity is set to it, else by duration; 100 when complete. */
function percentOf(t: Record<string, string>): number | null {
  if (t['status_code'] === 'TK_Complete') return 100;
  if (t['status_code'] === 'TK_NotStart') return 0;
  if (t['complete_pct_type'] === 'CP_Phys' || !t['target_drtn_hr_cnt']) {
    return t['phys_complete_pct'] === undefined || t['phys_complete_pct'] === '' ? null : num(t['phys_complete_pct']);
  }
  const target = num(t['target_drtn_hr_cnt']);
  if (target <= 0) return null;
  return Math.round(Math.max(0, Math.min(1, 1 - num(t['remain_drtn_hr_cnt']) / target)) * 10000) / 100;
}

/** The activity's dates: actual where it has them, else the remaining (or early, or planned) ones. */
function datesOf(t: Record<string, string>): Pick<ScheduleRow, 'start' | 'finish' | 'actual_start' | 'actual_finish'> {
  const actualStart = day(t['act_start_date']);
  const actualFinish = day(t['act_end_date']);
  const start = actualStart ?? day(t['restart_date']) ?? day(t['early_start_date']) ?? day(t['target_start_date']);
  const finish = actualFinish ?? day(t['reend_date']) ?? day(t['early_end_date']) ?? day(t['target_end_date']);
  if (t['task_type'] === 'TT_Mile') return { start, finish: start, actual_start: actualStart, actual_finish: actualStart };
  if (t['task_type'] === 'TT_FinMile') return { start: finish, finish, actual_start: actualFinish, actual_finish: actualFinish };
  return { start, finish, actual_start: actualStart, actual_finish: actualFinish };
}

/** The file's main project as a schedule: its name, data date, activities and relationships. */
export function xerSchedule(text: string): XerSchedule {
  const tables = readXer(text);
  const project = mainProject(tables);
  if (!project) return { title: null, dataDate: null, rows: [], warnings: ['No project in this XER.'], relationships: [] };
  const projId = project['proj_id'] ?? '';
  const wbs = wbsPaths((tables.get('PROJWBS')?.rows ?? []).filter((w) => w['proj_id'] === projId));
  const hoursPerDay = new Map((tables.get('CALENDAR')?.rows ?? []).map((c) => [c['clndr_id'] ?? '', num(c['day_hr_cnt']) || 8]));

  const codeTypes = new Map<string, CodeUse>();
  for (const t of tables.get('ACTVTYPE')?.rows ?? []) {
    const use = codeUse(t['actv_code_type'] ?? '');
    if (use) codeTypes.set(t['actv_code_type_id'] ?? '', use);
  }
  const codeValues = new Map((tables.get('ACTVCODE')?.rows ?? []).map((c) => [c['actv_code_id'] ?? '', (c['actv_code_name'] || c['short_name'] || '').trim()]));
  const taskCodes = new Map<string, Partial<Record<CodeUse, string>>>();
  for (const a of tables.get('TASKACTV')?.rows ?? []) {
    const use = codeTypes.get(a['actv_code_type_id'] ?? '');
    const value = codeValues.get(a['actv_code_id'] ?? '');
    if (!use || !value) continue;
    const mine = taskCodes.get(a['task_id'] ?? '') ?? {};
    mine[use] ??= value;
    taskCodes.set(a['task_id'] ?? '', mine);
  }

  const tasks = (tables.get('TASK')?.rows ?? []).filter((t) => t['proj_id'] === projId);
  const kept = tasks.filter((t) => KEEP_TYPES.has(t['task_type'] ?? ''));
  const rows: ScheduleRow[] = kept.map((t, i) => {
    const codes = taskCodes.get(t['task_id'] ?? '') ?? {};
    return {
      ...emptyRow(t['task_name'] ?? ''),
      ...datesOf(t),
      code: t['task_code'] ?? null,
      wbs: wbs.path(t['wbs_id'] ?? ''),
      area: codes.area ?? null,
      trade: codes.trade ?? null,
      csi_division: codes.csi ?? null,
      percent: percentOf(t),
      is_milestone: t['task_type'] === 'TT_Mile' || t['task_type'] === 'TT_FinMile',
      source_ref: `row ${String(i + 1)}`,
    };
  });

  const byTaskId = new Map(tasks.map((t) => [t['task_id'] ?? '', t]));
  const relationships: XerRelationship[] = [];
  for (const p of tables.get('TASKPRED')?.rows ?? []) {
    const succ = byTaskId.get(p['task_id'] ?? '');
    const pred = byTaskId.get(p['pred_task_id'] ?? '');
    if (!succ?.['task_code'] || !pred?.['task_code']) continue;
    const perDay = hoursPerDay.get(succ['clndr_id'] ?? '') ?? 8;
    relationships.push({
      pred: pred['task_code'],
      succ: succ['task_code'],
      type: PRED_TYPES[p['pred_type'] ?? ''] ?? 'FS',
      lagDays: Math.round((num(p['lag_hr_cnt']) / perDay) * 100) / 100,
    });
  }

  const left = tasks.length - kept.length;
  return {
    title: wbs.projectName ?? ((project['proj_short_name'] ?? '').trim() || null),
    dataDate: day(project['last_recalc_date']) ?? day(project['next_data_date']),
    rows,
    warnings: left > 0 ? [`${String(left)} level-of-effort or summary ${left === 1 ? 'activity' : 'activities'} left out.`] : [],
    relationships,
  };
}
