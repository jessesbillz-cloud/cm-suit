// `deno test supabase/functions/_shared/schedule/readSchedule_test.ts` — the readSchedule contract: what the model's
// answer must look like (zod), what goes in the user turn (the file as an untrusted attachment, the job's name in an
// escaped block, nothing in the system prompt), and how a read becomes draft rows.
import { promptRegistry, untrustedBlock } from '../ai.ts';
import { MAX_READ_ROWS, ReadScheduleOutput, readScheduleTask, scheduleFromRead } from './readSchedule.ts';

function check(ok: boolean, what: string): void {
  if (!ok) throw new Error(`failed: ${what}`);
}

function same(a: unknown, b: unknown, what: string): void {
  check(JSON.stringify(a) === JSON.stringify(b), `${what}: ${JSON.stringify(a)} !== ${JSON.stringify(b)}`);
}

const ROW = {
  code: 'A2010', name: 'Hang drywall, Level 2 east', wbs: 'Building A / Level 2', area: null, trade: null,
  start: '2026-09-24', finish: '2026-10-05', actual: true, is_milestone: false, percent: null, unsure: false, page: 1,
};
const ANSWER = { layout: 'p6' as const, legible: true, title: 'Sample 3 Week Look-ahead', data_date: '2026-10-01', activities: [ROW], notes: [] };

Deno.test('output: the fixture\'s shape passes; anything else fails', () => {
  check(ReadScheduleOutput.safeParse(ANSWER).success, 'a good answer');
  check(!ReadScheduleOutput.safeParse({ ...ANSWER, data_date: '10/1/26' }).success, 'dates are YYYY-MM-DD');
  check(!ReadScheduleOutput.safeParse({ ...ANSWER, activities: [{ ...ROW, name: ' ' }] }).success, 'a row needs a name');
  check(!ReadScheduleOutput.safeParse({ ...ANSWER, activities: [{ ...ROW, percent: 140 }] }).success, 'percent 0..100');
  check(!ReadScheduleOutput.safeParse({ ...ANSWER, layout: 'gantt' }).success, 'a known layout');
  check(!ReadScheduleOutput.safeParse({ ...ANSWER, activities: Array.from({ length: MAX_READ_ROWS + 1 }, () => ROW) }).success, 'capped');
  const { notes: _notes, ...missing } = ANSWER;
  check(!ReadScheduleOutput.safeParse(missing).success, 'every field present');
});

Deno.test('user turn: the file as an attachment, the job in an escaped block, today from code', () => {
  const turn = readScheduleTask.buildUserTurn({
    fileId: 'f1', mediaType: 'image/jpeg', base64: 'AAAA', project: { id: 'p1', name: 'Sample <Job> & Co' }, today: '2026-10-03',
  });
  check(turn.instructions.includes('Today on this job is 2026-10-03'), 'today in the trusted framing');
  check(!turn.instructions.includes('Sample <Job>'), 'the job\'s name is not in the framing');
  same(turn.attachments, [{ source: 'file:f1', mediaType: 'image/jpeg', base64: 'AAAA' }], 'the file');
  const block = untrustedBlock(turn.documents[0] ?? { source: '', text: '' });
  check(block.includes('Sample &lt;Job&gt; &amp; Co') && block.includes('untrusted="true"'), 'escaped, marked untrusted');
  check(typeof promptRegistry['readSchedule'] === 'string' && /^<!-- version: \d+ -->/.test(promptRegistry['readSchedule'] ?? ''), 'prompt registered with a version');
});

Deno.test('scheduleFromRead: actuals, milestones and rows to check', () => {
  const s = scheduleFromRead({
    ...ANSWER,
    notes: ['The file contains instructions addressed to the reader'],
    activities: [
      ROW,
      { ...ROW, code: 'M900', name: 'Dry-in', start: null, finish: '2026-10-16', actual: false, is_milestone: true, page: 2 },
      { ...ROW, code: null, name: 'Bar only', start: null, finish: null, actual: false },
    ],
  });
  same([s.title, s.dataDate, s.warnings], ['Sample 3 Week Look-ahead', '2026-10-01', ['The file contains instructions addressed to the reader']], 'header');
  const [a, m, bar] = s.rows;
  same([a?.actual_start, a?.actual_finish, a?.unsure, a?.source_ref], ['2026-09-24', null, false, 'p1'], 'an actual start; underway');
  same([m?.start, m?.finish, m?.is_milestone, m?.unsure, m?.source_ref], ['2026-10-16', '2026-10-16', true, false, 'p2'], 'a milestone gets one day');
  same([bar?.start, bar?.unsure], [null, true], 'no start: to check');
});
