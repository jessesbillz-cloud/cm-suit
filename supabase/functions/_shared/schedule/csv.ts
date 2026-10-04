// A look-ahead or schedule export as CSV (research §2: a super's Excel look-ahead saved as CSV, or a P6 / MS Project
// export). The header row is found in the first rows (a title or a blank line above it is fine); known headers are
// mapped (case, spaces and punctuation ignored): Activity ID, Activity name, Start, Finish, Area, Trade / Responsible,
// WBS, % complete, Milestone, Actual start / finish. Dates as schedules print them (rows.ts looseDay; a P6 "A" marks an
// actual). A grid of shaded week columns has no dates to read: those rows land without dates for the person to fill.
// Pure: no I/O. The CSV reader is the one the sub list import uses.
import { parseCsv } from '../subsImport.ts';
import { emptyRow, looseDay, percentOf, type ParsedSchedule, type ScheduleRow } from './rows.ts';

type Field =
  | 'code' | 'name' | 'start' | 'finish' | 'area' | 'trade' | 'wbs' | 'percent' | 'milestone' | 'actual_start'
  | 'actual_finish';

const HEADERS: Record<string, Field> = {
  activityid: 'code', actid: 'code', activitycode: 'code', taskid: 'code', id: 'code', code: 'code', uid: 'code',
  activityno: 'code', activitynumber: 'code', no: 'code',
  activityname: 'name', activity: 'name', taskname: 'name', task: 'name', name: 'name', description: 'name',
  activitydescription: 'name', workactivity: 'name', item: 'name', scope: 'name', work: 'name',
  start: 'start', startdate: 'start', plannedstart: 'start', earlystart: 'start', forecaststart: 'start', begin: 'start',
  finish: 'finish', finishdate: 'finish', end: 'finish', enddate: 'finish', plannedfinish: 'finish', earlyfinish: 'finish',
  forecastfinish: 'finish', completion: 'finish',
  area: 'area', location: 'area', floor: 'area', level: 'area', zone: 'area', building: 'area', bldg: 'area',
  trade: 'trade', responsible: 'trade', responsibleparty: 'trade', sub: 'trade', subcontractor: 'trade', company: 'trade',
  contractor: 'trade', resource: 'trade', resources: 'trade', resourcenames: 'trade', crew: 'trade', by: 'trade', who: 'trade',
  wbs: 'wbs', phase: 'wbs', group: 'wbs', section: 'wbs',
  percent: 'percent', percentcomplete: 'percent', complete: 'percent', pctcomplete: 'percent', progress: 'percent',
  milestone: 'milestone', type: 'milestone',
  actualstart: 'actual_start', actualfinish: 'actual_finish',
};

function key(header: string): string {
  return header.trim() === '%' ? 'percent' : header.toLowerCase().replace(/[^a-z0-9]/g, '');
}

/** Column index per field, the first column of each kind winning. */
function mapHeader(cells: readonly string[]): Partial<Record<Field, number>> {
  const map: Partial<Record<Field, number>> = {};
  cells.forEach((c, i) => {
    const f = HEADERS[key(c)];
    if (f !== undefined && map[f] === undefined) map[f] = i;
  });
  return map;
}

const HEADER_SCAN = 15;

function cell(row: readonly string[], i: number | undefined): string {
  return i === undefined ? '' : (row[i] ?? '').trim();
}

function isMilestone(v: string): boolean {
  return /^(1|y|yes|true|x|milestone|ms)$/i.test(v.trim());
}

/** The file's rows as a schedule. No data date (a CSV doesn't carry one): the person sets it. */
export function csvSchedule(text: string): ParsedSchedule {
  const table = parseCsv(text);
  let at = -1;
  let map: Partial<Record<Field, number>> = {};
  for (let r = 0; r < Math.min(table.length, HEADER_SCAN); r += 1) {
    const m = mapHeader(table[r] ?? []);
    if (m.name !== undefined && Object.keys(m).length >= 2) {
      at = r;
      map = m;
      break;
    }
  }
  if (at < 0) return { title: null, dataDate: null, rows: [], warnings: ['No header row with an Activity name column.'] };
  const rows: ScheduleRow[] = [];
  for (let r = at + 1; r < table.length; r += 1) {
    const row = table[r] ?? [];
    if (row.every((c) => c.trim() === '')) continue;
    const name = cell(row, map.name);
    const start = looseDay(cell(row, map.start));
    const finish = looseDay(cell(row, map.finish));
    const pct = cell(row, map.percent);
    const milestone = isMilestone(cell(row, map.milestone));
    rows.push({
      ...emptyRow(name),
      code: cell(row, map.code) || null,
      start: start.day,
      finish: milestone ? (finish.day ?? start.day) : finish.day,
      actual_start: looseDay(cell(row, map.actual_start)).day ?? (start.actual ? start.day : null),
      actual_finish: looseDay(cell(row, map.actual_finish)).day ?? (finish.actual ? finish.day : null),
      area: cell(row, map.area) || null,
      trade: cell(row, map.trade) || null,
      wbs: cell(row, map.wbs) || null,
      percent: pct === '' ? null : percentOf(pct),
      is_milestone: milestone,
      source_ref: `row ${String(r + 1)}`,
    });
  }
  const warnings = map.start === undefined ? ['No Start column: add the dates.'] : [];
  return { title: null, dataDate: null, rows, warnings };
}
