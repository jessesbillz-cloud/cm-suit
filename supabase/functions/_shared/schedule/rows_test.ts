// `deno test supabase/functions/_shared/schedule/rows_test.ts` — dates as schedules print them, the clean-up every
// import goes through, the CSV look-ahead and what a picked file is.
import { csvSchedule } from './csv.ts';
import { detectKind } from './detect.ts';
import { emptyRow, finishRows, looseDay, MAX_ROWS, percentOf } from './rows.ts';

function check(ok: boolean, what: string): void {
  if (!ok) throw new Error(`failed: ${what}`);
}

function same(a: unknown, b: unknown, what: string): void {
  check(JSON.stringify(a) === JSON.stringify(b), `${what}: ${JSON.stringify(a)} !== ${JSON.stringify(b)}`);
}

Deno.test('looseDay: the ways schedules print a date', () => {
  const cases: [string, string | null, boolean][] = [
    ['2026-10-05', '2026-10-05', false],
    ['2026-10-05 08:00', '2026-10-05', false],
    ['2026-10-05T08:00:00', '2026-10-05', false],
    ['10/5/26', '2026-10-05', false],
    ['10/05/2026', '2026-10-05', false],
    ['Mon 10/5/26', '2026-10-05', false],
    ['05-Oct-26', '2026-10-05', false],
    ['05-Oct-26 A', '2026-10-05', true],
    ['24-Sep-26A', '2026-09-24', true],
    ['07-Oct-26*', '2026-10-07', false],
    ['Oct 5, 2026', '2026-10-05', false],
    ['September 30, 2026', '2026-09-30', false],
    ['30 Sept 2026', '2026-09-30', false],
    ['2/30/2026', null, false],
    ['13/1/2026', null, false],
    ['next week', null, false],
    ['', null, false],
  ];
  for (const [raw, day, actual] of cases) same(looseDay(raw), { day, actual }, raw);
  same(looseDay(null), { day: null, actual: false }, 'not text');
});

Deno.test('percentOf: 0 to 100, two decimals', () => {
  same([percentOf('40%'), percentOf(' 12.345 '), percentOf(140), percentOf(-3), percentOf('n/a'), percentOf('')], [40, 12.35, 100, 0, null, null], 'values');
});

Deno.test('finishRows: trims, drops what can\'t be saved and says so', () => {
  const row = (over: Partial<ReturnType<typeof emptyRow>>) => ({ ...emptyRow('x'), ...over });
  const { rows, warnings } = finishRows([
    row({ code: ' A1 ', name: '  Form   footings ', start: '10/5/26', finish: '10/9/26', area: ' ', trade: 'T'.repeat(130) }),
    row({ code: 'a1', name: 'Repeated ID' }),
    row({ code: 'A2', name: '' }),
    row({ code: 'A3', name: 'Backwards', start: '2026-10-20', finish: '2026-10-18' }),
    row({ code: 'A4', name: 'Bad dates', start: '2026-02-30', actual_start: '2026-10-05', actual_finish: '2026-10-01', percent: 250 }),
  ], ['From the file.']);
  same(rows.map((r) => r.code), ['A1', 'A3', 'A4'], 'one row per Activity ID, names required');
  const [a, b, c] = rows;
  same([a?.name, a?.start, a?.finish, a?.area, a?.trade?.length], ['Form footings', '2026-10-05', '2026-10-09', null, 120], 'cleaned');
  same([b?.start, b?.finish, b?.unsure], ['2026-10-20', null, true], 'a finish before its start is cleared, the row to check');
  same([c?.start, c?.actual_start, c?.actual_finish, c?.percent], [null, '2026-10-05', null, 100], 'impossible dates and percents');
  same(warnings, [
    'From the file.',
    '1 row without a name left out.',
    '1 repeated Activity ID left out (the first kept).',
    '1 finish before the start cleared.',
  ], 'warnings, the file\'s first');
  const many = finishRows(Array.from({ length: MAX_ROWS + 3 }, (_, i) => row({ name: `Row ${String(i)}` })));
  same([many.rows.length, many.warnings], [MAX_ROWS, [`Only the first ${String(MAX_ROWS)} activities kept.`]], 'capped');
});

Deno.test('csvSchedule: the header found under a title, known columns mapped', () => {
  const csv = [
    'Sample 3-week look-ahead,,,,,,',
    ',,,,,,',
    'Activity ID,Activity Name,Start,Finish,Responsible,Area,% Complete,Milestone',
    'A100,"Form footings, grid A-C",10/5/26,10/9/26,Sample Concrete,Building A,25%,',
    'A110,Pour footings,10-Oct-26 A,10-Oct-26 A,Sample Concrete,Building A,100,',
    ',Rough plumbing,Mon 10/12/26,10/16/2026,Sample Plumbing,,,',
    'M1,Dry-in,11/6/26,,,,,yes',
    ',,,,,,',
    'A130,No dates yet,,,,,,',
  ].join('\r\n');
  const s = csvSchedule(csv);
  same([s.title, s.dataDate, s.warnings], [null, null, []], 'no data date in a CSV');
  same(s.rows.map((r) => [r.code, r.name, r.start, r.finish]), [
    ['A100', 'Form footings, grid A-C', '2026-10-05', '2026-10-09'],
    ['A110', 'Pour footings', '2026-10-10', '2026-10-10'],
    [null, 'Rough plumbing', '2026-10-12', '2026-10-16'],
    ['M1', 'Dry-in', '2026-11-06', '2026-11-06'],
    ['A130', 'No dates yet', null, null],
  ], 'rows');
  const [a, b, , m] = s.rows;
  same([a?.trade, a?.area, a?.percent, a?.source_ref], ['Sample Concrete', 'Building A', 25, 'row 4'], 'the other columns');
  same([b?.actual_start, b?.actual_finish], ['2026-10-10', '2026-10-10'], 'P6\'s A marks actuals');
  same(m?.is_milestone, true, 'a milestone');
  same(csvSchedule('Task,Who\nFrame walls,Sample Framing').warnings, ['No Start column: add the dates.'], 'a grid with no dates says so');
  same(csvSchedule('a,b\n1,2').warnings, ['No header row with an Activity name column.'], 'not a schedule');
});

Deno.test('detectKind: from the bytes, the name only for a CSV', () => {
  const bytes = (s: string) => new TextEncoder().encode(s);
  const kind = (name: string, mime: string, head: Uint8Array) => {
    const d = detectKind(name, mime, head);
    return 'kind' in d ? d.kind : `refuse:${d.refuse}`;
  };
  same(kind('a.bin', '', bytes('%PDF-1.7 ...')), 'pdf', 'a PDF by its bytes');
  same(kind('photo', 'image/jpeg', new Uint8Array([0xff, 0xd8, 0xff, 0xe0])), 'photo', 'a JPEG');
  same(kind('x.png', '', new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d])), 'photo', 'a PNG');
  same(kind('s.xer', '', bytes('ERMHDR\t19.12\t2026-10-01')), 'xer', 'an XER');
  same(kind('s.xml', 'text/xml', bytes('<?xml version="1.0"?><Project xmlns="http://schemas.microsoft.com/project">')), 'msp_xml', 'Project XML');
  same(kind('s.xml', 'text/xml', bytes('<?xml version="1.0"?><APIBusinessObjects xmlns="x">')), 'refuse:p6_xml', 'P6 XML: export XER');
  same(kind('la.csv', 'text/csv', bytes('Activity,Start\nA,1/1/26')), 'csv', 'a CSV');
  same(kind('s.mpp', '', new Uint8Array([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1])), 'refuse:mpp', '.mpp: save as XML');
  same(kind('la.xlsx', '', new Uint8Array([0x50, 0x4b, 0x03, 0x04])), 'refuse:excel', 'Excel: save as CSV');
  same(kind('p.heic', '', new Uint8Array([0, 0, 0, 0x18, 0x66, 0x74, 0x79, 0x70])), 'refuse:photo_format', 'HEIC');
  same(kind('notes.txt', 'text/plain', bytes('hello there')), 'refuse:unknown', 'anything else');
});
