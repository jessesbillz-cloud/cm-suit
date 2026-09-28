// `deno test --config supabase/functions/deno.json supabase/functions/_shared/rfis_test.ts` — RFI hash, filename,
// labels, the PDF plan and its key, on synthetic data.
import {
  calendarDay, dateInZone, impactDaysOf, type RfiDetail, rfiFilename, rfiHash, type RfiJob, rfiPdfKey, rfiPdfPlan, type RfiRow,
} from './rfis.ts';

function check(ok: boolean, what: string): void {
  if (!ok) throw new Error(`failed: ${what}`);
}

const ROW: RfiRow = {
  id: 'r1', org_id: 'o1', project_id: 'p1', created_by: 'u1', version: 4, number: null, status: 'draft',
  title: 'Slab edge at grid B', question: 'Detail 3/S-201 conflicts with the embed. Which governs?', suggestion: '',
  refs: 'S-201', photo_ids: ['f1'], cost_impact: null, time_impact: true, needed_by: '2026-10-05', due_at: null,
  sent_at: null, sent_by: null, sent_hash: null, issued_at: null, issued_by: null, issued_hash: null, answer: null,
  answer_file_ids: [], answered_at: null, answered_by: null, impact_until: null, impact_claimed_at: null, impact_cost: null,
  impact_time: null, impact_note: null, impact_gc_note: null, void_note: null, pdf_file_id: null, pdf_hash: null,
};

const JOB: RfiJob = {
  name: 'Sample Job A', number: 'S-100', address: '100 Sample Way', timezone: 'America/Los_Angeles',
  orgName: 'Sample Builders', logoPath: null,
};

function detail(over: Partial<RfiRow> = {}): Omit<RfiDetail, 'raw'> {
  return {
    rfi: { ...ROW, ...over },
    originator_name: 'Sam Sample',
    originator_company: 'Sample Concrete Co',
    issuer_name: over.issued_by ? 'Pat Sample' : null,
    answerer_name: over.answered_by ? 'Ann Sample' : null,
    photos: [{ id: 'f1', original_name: 'crack.jpg', mime: 'image/jpeg' }, { id: 'f2', original_name: 'crack.heic', mime: 'image/heic' }],
    answer_files: [],
    settings: { answer_days: 7, impact_days: 7 },
  };
}

Deno.test('hash: the signed content only', async () => {
  const a = await rfiHash(ROW);
  check(/^[0-9a-f]{64}$/.test(a), 'sha256 hex');
  check(a === (await rfiHash({ ...ROW, version: 9, status: 'issue', number: 3 })), 'status, number and version are not signed');
  check(a === (await rfiHash({ ...ROW, answer: 'Yes', answered_at: '2026-10-01T00:00:00Z' })), 'the answer is not in the signatures');
  check(a !== (await rfiHash({ ...ROW, question: `${ROW.question}!` })), 'the question is signed');
  check(a !== (await rfiHash({ ...ROW, photo_ids: [] })), 'the photos are signed');
  check(a !== (await rfiHash({ ...ROW, cost_impact: true })), 'the possible impact is signed');
});

Deno.test('filename: number padded, draft, safe characters, long titles cut', () => {
  check(rfiFilename(3, 'Slab edge at grid B') === 'RFI 003 Slab edge at grid B.pdf', 'numbered');
  check(rfiFilename(null, 'Slab edge') === 'RFI Draft Slab edge.pdf', 'draft');
  check(rfiFilename(12, 'Door 1/2: "hardware"?') === 'RFI 012 Door 1-2- -hardware--.pdf', 'illegal characters replaced');
  check(rfiFilename(1, 'Line one\nline two\ttab') === 'RFI 001 Line one line two tab.pdf', 'control characters become spaces');
  const long = rfiFilename(1, 'x'.repeat(200));
  check(long.length === 'RFI 001 .pdf'.length + 120, 'title cut at 120');
});

Deno.test('labels: days in the job zone, calendar days as written, the impact window', () => {
  check(dateInZone('2026-10-02T03:05:00Z', 'America/Los_Angeles') === 'Oct 1, 2026', 'evening in Pacific is still the 1st');
  check(calendarDay('2026-10-05') === 'Oct 5, 2026', 'calendar day');
  check(impactDaysOf({ answered_at: '2026-10-01T10:00:00Z', impact_until: '2026-10-11T10:00:00Z' }, 7) === 10, 'window as given');
  check(impactDaysOf({ answered_at: null, impact_until: null }, 7) === 7, 'not answered: the job setting');
});

Deno.test('plan: a draft is marked DRAFT, has no stamps, embeds JPEG and lists the rest', () => {
  const plan = rfiPdfPlan(detail(), JOB);
  check(plan.text.mark === 'DRAFT' && plan.stamps.length === 0, 'draft, unsigned');
  check(plan.photos.length === 1 && plan.photos[0]?.id === 'f1', 'the JPEG is embedded');
  check(plan.text.otherPhotos.join() === 'crack.heic', 'the HEIC is listed');
  check(plan.text.neededByLabel === 'Oct 5, 2026' && plan.text.to === 'Architect', 'needed by, to');
  check(plan.filename === 'RFI Draft Slab edge at grid B.pdf', 'draft filename');
});

Deno.test('plan: issued and answered carry both signatures and the answer; the key follows what it shows', async () => {
  const issued = detail({
    status: 'open', number: 3, sent_at: '2026-09-28T17:00:00Z', sent_by: 'u1', sent_hash: 'a'.repeat(64),
    issued_at: '2026-09-29T17:00:00Z', issued_by: 'u2', issued_hash: 'b'.repeat(64), due_at: '2026-10-06T17:00:00Z',
  });
  const plan = rfiPdfPlan(issued, JOB);
  check(plan.text.mark === null && plan.filename === 'RFI 003 Slab edge at grid B.pdf', 'numbered, no mark');
  check(plan.stamps.map((s) => `${s.align}:${s.name}`).join() === 'left:Sam Sample,right:Pat Sample', 'two stamps');
  check(plan.text.answer === null && plan.text.dueLabel === 'Oct 6, 2026', 'awaiting the answer, due date');
  const key = await rfiPdfKey(plan);
  check(key === (await rfiPdfKey(rfiPdfPlan(issued, JOB))), 'the same RFI, the same key');
  const answered = rfiPdfPlan(detail({
    ...issued.rfi, status: 'answered', answer: 'The embed governs.', answered_at: '2026-10-01T17:00:00Z', answered_by: 'u3',
    impact_until: '2026-10-08T17:00:00Z',
  }), JOB);
  check(answered.text.answer?.by === 'Ann Sample' && answered.text.to === 'Ann Sample', 'answered by');
  check(key !== (await rfiPdfKey(answered)), 'answering makes a new PDF');
  check(key !== (await rfiPdfKey(rfiPdfPlan(issued, { ...JOB, logoPath: 'org/o1/logo' }))), 'a new logo makes a new PDF');
  const voided = rfiPdfPlan(detail({ ...issued.rfi, status: 'void', void_note: 'Duplicate' }), JOB);
  check(voided.text.mark === 'VOID', 'void is marked');
});
