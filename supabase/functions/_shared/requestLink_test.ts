// `deno test supabase/functions/_shared/requestLink_test.ts` — the request link's request and answer whitelist.
import {
  calendarAnswer,
  hubAnswer,
  joinAnswer,
  openAnswer,
  registeredFiles,
  RequestLinkBody,
  statusAnswer,
  SubmitBody,
  submitAnswer,
} from './requestLink.ts';

function check(ok: boolean, what: string): void {
  if (!ok) throw new Error(`failed: ${what}`);
}

const TOKEN = 'A'.repeat(43);
const PROJECT = '00000000-0000-4000-8000-000000000001';
const HUB = '00000000-0000-4000-8000-000000000002';
const USER = '00000000-0000-4000-8000-000000000003';

Deno.test('open answer: the job name and the caller\'s own two facts, nothing else', () => {
  const out = openAnswer({ project_name: 'Sample Job', org_id: PROJECT, timezone: 'America/Los_Angeles', email: 'x@example.test' }, true, true);
  check(JSON.stringify(Object.keys(out).sort()) === JSON.stringify(['can_request', 'member', 'project_name']), 'keys');
  check(out.member && out.can_request && out.project_name === 'Sample Job', 'values');
  check(!openAnswer({ project_name: 'Sample Job' }, false, true).can_request, 'no request form for a non-member');
});

Deno.test('join answer: name and status only; an unknown status fails loudly', () => {
  const out = joinAnswer({ project_name: 'Sample Job', status: 'added', member_id: PROJECT, invite_email: 'x@example.test' });
  check(JSON.stringify(Object.keys(out).sort()) === JSON.stringify(['project_name', 'status']), 'keys');
  let threw = false;
  try {
    joinAnswer({ project_name: 'Sample Job', status: 'owner' });
  } catch {
    threw = true;
  }
  check(threw, 'status is added | member');
});

Deno.test('hub answer: job names and ids only, nothing about the owner', () => {
  const out = hubAnswer({
    owner: USER,
    owner_email: 'x@example.test',
    jobs: [{ project_id: PROJECT, name: 'Sample Job', address: '1 Sample St', request_token_hash: 'f'.repeat(64) }],
  });
  check(JSON.stringify(Object.keys(out)) === JSON.stringify(['jobs']), 'top-level keys');
  check(JSON.stringify(Object.keys(out.jobs[0] ?? {}).sort()) === JSON.stringify(['name', 'project_id']), 'job keys');
  const text = JSON.stringify(out);
  check(!text.includes(USER) && !text.includes('@') && !text.includes('fff'), 'no owner, no email, no hash');
});

Deno.test('request: each action is strict and bounded', () => {
  check(RequestLinkBody.safeParse({ action: 'open', project_id: PROJECT, token: TOKEN }).success, 'open with the job token');
  check(RequestLinkBody.safeParse({ action: 'open', project_id: PROJECT, token: TOKEN, hub_id: HUB }).success, 'open with a hub token');
  const join = RequestLinkBody.safeParse({ action: 'join', project_id: PROJECT, token: TOKEN, name: ' Sample Sub ', company: 'Sample Co' });
  check(join.success && join.data.action === 'join' && join.data.name === 'Sample Sub', 'join, trimmed');
  check(RequestLinkBody.safeParse({ action: 'hub', hub_id: HUB, token: TOKEN }).success, 'hub');
  check(RequestLinkBody.safeParse({ action: 'calendar', project_id: PROJECT, token: TOKEN }).success, 'calendar: the job\'s today');
  check(RequestLinkBody.safeParse({ action: 'calendar', project_id: PROJECT, token: TOKEN, day: '2026-10-05' }).success, 'calendar: a day');
  check(RequestLinkBody.safeParse({ action: 'status', project_id: PROJECT, receipt: TOKEN }).success, 'status: by its receipt');
  check(RequestLinkBody.safeParse({ action: 'ir', project_id: PROJECT, receipt: TOKEN }).success, 'ir: by its receipt (0075)');
  const bad = [
    { action: 'open', project_id: PROJECT, token: 'short' },
    { action: 'open', project_id: 'not-a-uuid', token: TOKEN },
    // The address comes from the session, never the body.
    { action: 'join', project_id: PROJECT, token: TOKEN, name: 'A', company: 'B', email: 'x@example.test' },
    { action: 'join', project_id: PROJECT, token: TOKEN, name: '   ', company: 'B' },
    { action: 'join', project_id: PROJECT, token: TOKEN, name: 'A'.repeat(121), company: 'B' },
    { action: 'join', project_id: PROJECT, token: TOKEN, name: 'A', company: 'B', role: 'pm' },
    { action: 'hub', token: TOKEN },
    { action: 'rotate', project_id: PROJECT, token: TOKEN },
    { action: 'calendar', project_id: PROJECT, token: TOKEN, day: 'today' },
    { action: 'status', project_id: PROJECT, receipt: 'short' },
    // The IR only by its receipt, never by a request or file id.
    { action: 'ir', project_id: PROJECT, receipt: TOKEN, file_id: PROJECT },
    { action: 'ir', project_id: PROJECT, token: TOKEN },
    // A submit is a multipart form, never JSON.
    { action: 'submit', project_id: PROJECT, token: TOKEN },
  ];
  for (const b of bad) check(!RequestLinkBody.safeParse(b).success, `refused: ${JSON.stringify(b)}`);
});

const FACTS = {
  project_name: 'Sample Job',
  number: 14,
  request_date: '2026-10-05',
  start_time: '09:00:00',
  duration_kind: 'timed',
  duration_min: 60,
  kind: 'ior',
  special_kind: null,
  status: 'pending',
  result: null,
  result_note: null,
  gc_step: false,
  ofs_sent: false,
  postpone_reason: null,
  postpone_note: null,
  postpone_until: null,
  attendance: null,
  has_ir: false,
};

Deno.test('calendar answer: time, length, type and color per row; nothing about anyone', () => {
  const out = calendarAnswer({
    today: '2026-10-02',
    day: '2026-10-05',
    ofs: false,
    kinds: [{ id: PROJECT, name: 'Concrete', sort: 10 }],
    rows: [{ start_time: '08:00:00', duration_kind: 'timed', duration_min: 60, kind: 'ior', status_key: 'pending',
             company: 'Sample Concrete Co', items: 'Footings', number: 3, requested_by: USER }],
    timezone: 'America/Los_Angeles',
  });
  check(JSON.stringify(Object.keys(out).sort()) === JSON.stringify(['day', 'kinds', 'ofs', 'rows', 'today']), 'top-level keys');
  check(JSON.stringify(Object.keys(out.rows[0] ?? {}).sort()) ===
    JSON.stringify(['duration_kind', 'duration_min', 'kind', 'start_time', 'status_key']), 'row keys');
  const text = JSON.stringify(out);
  check(!text.includes('Sample Concrete Co') && !text.includes('Footings') && !text.includes(USER), 'no company, items or person');
});

Deno.test('status answer: the tracker facts and the result line only', () => {
  const out = statusAnswer({
    ...FACTS, requester_name: 'Sample Visitor', requester_phone: '555 010 2030', confirm_note: 'Gate code', owner_id: USER,
    ir_file_id: PROJECT, helper_note: 'Helper note',
  });
  check(JSON.stringify(Object.keys(out).sort()) === JSON.stringify(Object.keys(FACTS).sort()), 'keys');
  const text = JSON.stringify(out);
  check(!text.includes('Sample Visitor') && !text.includes('555') && !text.includes('Gate') && !text.includes(USER), 'no contact, notes or people');
  check(!text.includes(PROJECT) && !text.includes('Helper note'), 'never the IR file id or the helper note');
});

Deno.test('status answer (0061): whether an OFS request is with OFS, as a yes or no; never when or who sent it', () => {
  const out = statusAnswer({ ...FACTS, kind: 'ofs', ofs_sent: true, ofs_sent_at: '2026-10-03T17:00:00Z', ofs_sent_by: USER, special_required: true });
  check(out.ofs_sent === true, 'with OFS');
  const text = JSON.stringify(out);
  check(!text.includes('ofs_sent_at') && !text.includes(USER) && !text.includes('special_required'), 'no time, no sender, no answer');
  check(statusAnswer(FACTS).ofs_sent === false, 'an IOR request is never with OFS');
  for (const bad of [undefined, null, 'true', 1]) {
    let threw = false;
    try {
      statusAnswer({ ...FACTS, ofs_sent: bad });
    } catch {
      threw = true;
    }
    check(threw, `ofs_sent is a boolean: ${String(bad)} fails loudly`);
  }
  check(submitAnswer({ ...FACTS, ofs_sent: false, receipt: TOKEN }).ofs_sent === false, 'the receipt carries it too');
});

Deno.test('submit answer: the facts plus the receipt token; a malformed receipt fails loudly', () => {
  const out = submitAnswer({ ...FACTS, receipt: TOKEN, receipt_hash: 'f'.repeat(64) });
  check(out.receipt === TOKEN && !JSON.stringify(out).includes('fff'), 'receipt only, never its hash');
  let threw = false;
  try {
    submitAnswer({ ...FACTS, receipt: 'short' });
  } catch {
    threw = true;
  }
  check(threw, 'a 43-character receipt');
});

Deno.test('registered files: one slot per file sent, in order', () => {
  const slots = registeredFiles({ files: [{ id: PROJECT, storage_path: 'project/x/y/z/a.jpg' }] }, 1);
  check(slots.length === 1 && slots[0]?.id === PROJECT, 'one slot');
  let threw = false;
  try {
    registeredFiles({ files: [{ id: PROJECT, storage_path: 'p' }] }, 2);
  } catch {
    threw = true;
  }
  check(threw, 'a missing slot fails loudly');
});

const SUBMIT = {
  action: 'submit',
  project_id: PROJECT,
  token: TOKEN,
  name: ' Sample Visitor ',
  company: 'Sample Framing',
  phone: '(555) 010-2030',
  email: '',
  date: '2026-10-05',
  time: '09:30',
  duration_kind: 'timed',
  duration_min: 60,
  kind: 'ior',
  special_kind_id: null,
  items: 'North wall framing',
  notice_ack: true,
};

Deno.test('submit body: every member-form field plus a contact; strict and bounded', () => {
  const ok = SubmitBody.safeParse(SUBMIT);
  check(ok.success && ok.data.name === 'Sample Visitor', 'a phone only, trimmed');
  check(SubmitBody.safeParse({ ...SUBMIT, phone: '', email: ' Visitor@Example.TEST ' }).success, 'an email only');
  check(SubmitBody.safeParse({ ...SUBMIT, time: null, duration_kind: 'all_day', duration_min: null }).success, 'Flexible, all day');
  check(SubmitBody.safeParse({ ...SUBMIT, kind: 'special', special_kind_id: HUB }).success, 'a special with its kind');
  const bad = [
    { ...SUBMIT, phone: '', email: '' },
    { ...SUBMIT, phone: 'call me' },
    { ...SUBMIT, email: 'not-an-email' },
    { ...SUBMIT, notice_ack: false },
    { ...SUBMIT, time: '09:15' },
    { ...SUBMIT, duration_kind: 'timed', duration_min: null },
    { ...SUBMIT, kind: 'special', special_kind_id: null },
    { ...SUBMIT, items: '   ' },
    { ...SUBMIT, name: 'A'.repeat(121) },
    // Never an uploader, a path, a number or a status from the body.
    { ...SUBMIT, requested_by: USER },
    { ...SUBMIT, storage_path: 'project/x' },
    { ...SUBMIT, number: 1 },
    { ...SUBMIT, status: 'confirmed' },
  ];
  for (const b of bad) check(!SubmitBody.safeParse(b).success, `refused: ${JSON.stringify(b).slice(0, 80)}`);
});

/** The words a refused body carries for one field (what parseText hands the page as details.fieldErrors). */
function fieldErrors(body: unknown, field: string): string[] {
  const r = SubmitBody.safeParse(body);
  return r.success ? [] : (r.error.flatten().fieldErrors as Record<string, string[] | undefined>)[field] ?? [];
}

Deno.test('submit body (0061): an OFS request answers "special inspection required?"; no other kind carries it', () => {
  const ASK = 'Answer the special inspection question.';
  const yes = SubmitBody.safeParse({ ...SUBMIT, kind: 'ofs', special_required: true });
  check(yes.success && yes.data.special_required === true, 'OFS: yes');
  const no = SubmitBody.safeParse({ ...SUBMIT, kind: 'ofs', special_required: false });
  check(no.success && no.data.special_required === false, 'OFS: no is an answer');
  check(SubmitBody.safeParse(SUBMIT).success, 'IOR: absent');
  check(SubmitBody.safeParse({ ...SUBMIT, special_required: null }).success, 'IOR: null');
  check(SubmitBody.safeParse({ ...SUBMIT, kind: 'special', special_kind_id: HUB, special_required: null }).success, 'special: null');

  check(fieldErrors({ ...SUBMIT, kind: 'ofs' }, 'special_required')[0] === ASK, 'OFS, absent: asked in words');
  check(fieldErrors({ ...SUBMIT, kind: 'ofs', special_required: null }, 'special_required')[0] === ASK, 'OFS, null: asked in words');
  check(fieldErrors({ ...SUBMIT, kind: 'ofs', special_required: 'yes' }, 'special_required')[0] === ASK, 'true or false, not a word');
  check(fieldErrors({ ...SUBMIT, kind: 'ofs', special_required: 1 }, 'special_required')[0] === ASK, 'true or false, not a number');
  for (const v of [true, false]) {
    const ior = fieldErrors({ ...SUBMIT, special_required: v }, 'special_required');
    check(ior.length === 1 && ior[0] !== ASK && /OFS/.test(ior[0] ?? ''), `IOR with an answer (${String(v)}): refused in words`);
    check(!SubmitBody.safeParse({ ...SUBMIT, kind: 'special', special_kind_id: HUB, special_required: v }).success, `special with an answer (${String(v)}): refused`);
  }
  // The checklist of the first 0061 is gone: its body is an unknown key now, refused like any other.
  const READY = { previous: 'yes', trade: 'yes', gc: 'yes', ior: 'na', special: 'na' };
  check(!SubmitBody.safeParse({ ...SUBMIT, kind: 'ofs', special_required: true, readiness: READY }).success, 'no readiness body');
  check(!SubmitBody.safeParse({ ...SUBMIT, readiness: null }).success, 'not even an empty one');
});
