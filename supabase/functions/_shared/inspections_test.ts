// `deno test --config supabase/functions/deno.json supabase/functions/_shared/inspections_test.ts` — IR labels and hash.
import { dayLabel, durationLabel, irHash, type IrRow, signedAtLabel, timeLabel, typeLabel } from './inspections.ts';

function check(ok: boolean, what: string): void {
  if (!ok) throw new Error(`failed: ${what}`);
}

const ROW: IrRow = {
  id: 'r1', org_id: 'o1', project_id: 'p1', number: 7, version: 3, requested_by: 'u1', company: 'Sample Concrete Co',
  request_date: '2026-10-01', start_time: '13:30:00', duration_kind: 'timed', duration_min: 90, kind: 'ior',
  items: 'Footing rebar', status: 'confirmed', owner_id: 'u2', result: 'approved', result_note: 'No issues',
  result_photo_ids: [], ir_file_id: null, content_hash: null, signed_at: null, signed_by: null, pdf_stale: false,
  pdf_postponed: false, postpone_reason: null, postpone_note: null, postpone_until: null, ir_special_kinds: null,
};

Deno.test('labels: time, length, day and type', () => {
  check(timeLabel(null) === 'Flexible', 'flexible');
  check(timeLabel('13:30:00') === '1:30 PM', 'afternoon');
  check(timeLabel('00:00:00') === '12:00 AM', 'midnight');
  check(timeLabel('12:00:00') === '12:00 PM', 'noon');
  check(durationLabel({ duration_kind: 'timed', duration_min: 30 }) === '30 min', 'minutes');
  check(durationLabel({ duration_kind: 'timed', duration_min: 90 }) === '1.5 hr', 'hours');
  check(durationLabel({ duration_kind: 'all_day', duration_min: null }) === 'All day', 'all day');
  check(dayLabel('2026-10-01') === 'Thu, Oct 1, 2026', 'day as written');
  check(typeLabel({ kind: 'special', ir_special_kinds: { name: 'Concrete' } }) === 'Special: Concrete', 'special');
  check(typeLabel({ kind: 'ofs', ir_special_kinds: null }) === 'OFS', 'ofs');
});

Deno.test('labels: the signed time shows in the job zone (Pacific evening, DST)', () => {
  const label = signedAtLabel('2026-10-02T03:05:00Z', 'America/Los_Angeles');
  check(label.startsWith('Oct 1, 2026') && label.includes('8:05') && label.includes('PM') && label.includes('PDT'), label);
  check(signedAtLabel('2026-12-02T03:05:00Z', 'America/Los_Angeles').includes('PST'), 'standard time in winter');
});

Deno.test('hash: same content, same hash; a changed note or version-only change', async () => {
  const a = await irHash(ROW);
  check(a === (await irHash({ ...ROW, version: 9, status: 'complete' })), 'version and status are not signed content');
  check(a !== (await irHash({ ...ROW, result_note: 'No issues.' })), 'the note is signed content');
  check(/^[0-9a-f]{64}$/.test(a), 'sha256 hex');
});
