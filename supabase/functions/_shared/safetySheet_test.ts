// `deno test supabase/functions/_shared/safetySheet_test.ts` — the sign-in sheet's facts, labels and content hash.
import { contentHash } from './crypto.ts';
import { clockLabel, sheetContent, sheetFactsSchema, sheetInput, type SheetFacts } from './safetySheet.ts';

function check(ok: boolean, what: string): void {
  if (!ok) throw new Error(`failed: ${what}`);
}

const ID = '00000000-0000-4000-8000-000000000001';

function facts(over: Partial<SheetFacts> = {}): SheetFacts {
  return sheetFactsSchema.parse({
    meeting_id: ID, project_id: ID, job_name: 'Sample Job A', job_number: null, timezone: 'America/Los_Angeles', number: 3,
    kind: 'tailgate', held_on: '2026-10-05', title: 'Ladders', notes: '', points: ['Three points of contact.'], questions: [],
    source: '8 CCR 1675', source_url: 'https://www.dir.ca.gov/title8/1675.html', leader_name: 'Sol Super', location: '',
    opened_at: '2026-10-05T14:30:00+00:00', closed_at: '2026-10-05T14:55:00+00:00', closed_by_name: 'Sol Super',
    pdf_file_id: null, content_hash: null,
    attendees: [
      { name: 'Lee Laborer', company: 'Sample Framing', trade: '', via: 'link', signed_at: '2026-10-05T14:42:00+00:00',
        signature: [[[0.1, 0.1], [0.2, 0.2]]], added_by_name: null },
      { name: 'Fay Foreman', company: '', trade: '', via: 'member', signed_at: null, signature: null, added_by_name: 'Sol Super' },
    ],
    ...over,
  });
}

Deno.test('labels: the job\'s day and clock, the closer', () => {
  const input = sheetInput(facts());
  check(input.dayLabel === 'Mon, Oct 5, 2026', input.dayLabel);
  check(input.attendees[0]?.timeLabel === '7:42 AM', `signed at ${String(input.attendees[0]?.timeLabel)}`);
  check(input.closedLabel.endsWith('by Sol Super') && input.closedLabel.includes('7:55'), input.closedLabel);
  check(input.attendees[1]?.tickedBy === 'Sol Super' && input.attendees[1]?.timeLabel === null, 'ticked in, no signature');
  check(clockLabel('2026-10-05T20:05:00Z', 'America/New_York') === '4:05 PM', 'another zone');
});

Deno.test('content hash: the file on record does not change it; a new signature does', async () => {
  const a = await contentHash(sheetContent(facts()));
  const b = await contentHash(sheetContent(facts({ pdf_file_id: ID, content_hash: 'f'.repeat(64) })));
  check(a === b, 'the sheet on file is not part of what it shows');
  const more = facts();
  more.attendees.push({ name: 'Mo Mason', company: 'Sample Masonry', trade: '', via: 'link', signed_at: '2026-10-05T14:50:00+00:00',
    signature: [[[0.3, 0.3], [0.4, 0.4]]], added_by_name: null });
  check(a !== (await contentHash(sheetContent(more))), 'one more person is a new sheet');
});

Deno.test('facts: a bad signature from the database fails loudly', () => {
  const bad = { ...facts(), attendees: [{ name: 'X', company: '', trade: '', via: 'link', signed_at: null, signature: [[[3, 3]]], added_by_name: null }] };
  check(!sheetFactsSchema.safeParse(bad).success, 'refused');
});
