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
  const out = statusAnswer({ ...FACTS, requester_name: 'Sample Visitor', requester_phone: '555 010 2030', confirm_note: 'Gate code', owner_id: USER });
  check(JSON.stringify(Object.keys(out).sort()) === JSON.stringify(Object.keys(FACTS).sort()), 'keys');
  const text = JSON.stringify(out);
  check(!text.includes('Sample Visitor') && !text.includes('555') && !text.includes('Gate') && !text.includes(USER), 'no contact, notes or people');
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
