/// <reference types="node" />
// Role probe, no-login inspection requests (0055, SPEC §6.4 #4): with no session, the link answers the outsider's day
// (time, length, type, color) and takes a request with a photo; the receipt opens the status link (the tracker's facts
// and the result line only) and that request's map (none here: no walls); the job's walls come with their status only
// (0057); a wrong token or receipt is a 404; the inspector reads the visitor's contact on the row, a
// sub sees the request only anonymized, and a requester (the role a link visitor gets when they sign in) reads no
// folders, no people but themselves and no RFIs. Called from _requestLink.ts with the job's live token.
import { type Client, type Report, rowsOf } from './_lib';

type ProbeUser = 'sub' | 'inspector' | 'requester';

interface NoLoginProbe {
  report: Report;
  url: string;
  anonKey: string;
  projectId: string;
  as: (key: ProbeUser) => Client;
}

const DAY_KEYS = 'duration_kind,duration_min,kind,start_time,status_key';
// 0075: the postponement, the attendance call and whether the IR is made.
const FACT_KEYS =
  'attendance,duration_kind,duration_min,gc_step,has_ir,kind,number,ofs_sent,postpone_note,postpone_reason,postpone_until,project_name,' +
  'request_date,result,result_note,special_kind,start_time,status';

const keysOf = (o: unknown): string => Object.keys(o ?? {}).sort().join(',');

function rows(res: { data: unknown; error: { message: string } | null }, what: string): Record<string, unknown>[] {
  if (res.error) throw new Error(`${what}: ${res.error.message}`);
  return rowsOf(res.data);
}

/** POST with no Authorization header: the visitor has no session. */
function post(p: NoLoginProbe, body: Record<string, unknown> | FormData): Promise<Response> {
  const form = body instanceof FormData;
  return fetch(`${p.url}/functions/v1/request-link`, {
    method: 'POST',
    headers: { apikey: p.anonKey, ...(form ? {} : { 'content-type': 'application/json' }) },
    body: form ? body : JSON.stringify(body),
  });
}

/** A day a week out, as yyyy-mm-dd (any zone: the job's today is at most a day away). */
function weekOut(): string {
  return new Date(Date.now() + 7 * 86_400_000).toISOString().slice(0, 10);
}

/** A tiny file that starts like a JPEG (the function checks the bytes, not the name). */
function photo(): Blob {
  const b = new Uint8Array(256);
  b.set([0xff, 0xd8, 0xff, 0xe0]);
  return new Blob([b], { type: 'image/jpeg' });
}

function form(p: NoLoginProbe, token: string, items: string): FormData {
  const f = new FormData();
  f.append('payload', JSON.stringify({
    action: 'submit', project_id: p.projectId, token, name: 'Probe Visitor', company: 'Probe Framing', phone: '555 010 2030',
    email: '', date: weekOut(), time: '10:00', duration_kind: 'timed', duration_min: 60, kind: 'ior', special_kind_id: null,
    items, notice_ack: true,
  }));
  f.append('file', photo(), 'probe.jpg');
  return f;
}

export async function checkNoLogin(p: NoLoginProbe, token: string): Promise<void> {
  const { report } = p;
  const cal = await post(p, { action: 'calendar', project_id: p.projectId, token, day: weekOut() });
  const day = (await cal.json()) as { rows?: unknown[] };
  report.check('no login', 'calendar with no session (200)', cal.status === 200, `status ${cal.status}`);
  report.check('no login', 'calendar: time, length, type and color only',
    (day.rows ?? []).every((r) => keysOf(r) === DAY_KEYS) && keysOf(day) === 'attest_text,day,kinds,ofs,rows,today', keysOf(day));

  const items = `Probe framing ${Date.now()}`;
  const sent = await post(p, form(p, token, items));
  const receipt = (await sent.json()) as Record<string, unknown>;
  report.check('no login', 'request with a photo and no session (201)', sent.status === 201, `status ${sent.status}`);
  report.check('no login', 'receipt: the facts plus the receipt token', keysOf(receipt) === FACT_KEYS.replace('project_name,', 'project_name,receipt,'),
    keysOf(receipt));
  const wrong = await post(p, form(p, 'A'.repeat(43), items));
  report.check('no login', 'request with a wrong token (404)', wrong.status === 404, `status ${wrong.status}`);

  const status = await post(p, { action: 'status', project_id: p.projectId, receipt: receipt['receipt'] });
  const facts = (await status.json()) as unknown;
  report.check('no login', 'status link: the tracker facts only (200)', status.status === 200 && keysOf(facts) === FACT_KEYS, keysOf(facts));
  const stranger = await post(p, { action: 'status', project_id: p.projectId, receipt: 'B'.repeat(43) });
  report.check('no login', 'status with a wrong receipt (404)', stranger.status === 404, `status ${stranger.status}`);

  // Revs from the link (0057): the walls with their status only; a request without walls has no map.
  const revs = await post(p, { action: 'revs', project_id: p.projectId, token });
  const walls = (await revs.json()) as Record<string, unknown>;
  report.check('no login', 'revs: lists, revs, items, walls and status (200)',
    revs.status === 200 && keysOf(walls) === 'areas,items,lists,revs,status', `status ${revs.status} ${keysOf(walls)}`);
  const cells = Array.isArray(walls['status']) ? (walls['status'] as unknown[]) : [];
  report.check('no login', 'revs: a status row is the wall, the item and the status only',
    cells.every((r) => keysOf(r) === 'area_id,item_id,status'), `${cells.length} rows`);
  const map = await post(p, { action: 'map', project_id: p.projectId, receipt: receipt['receipt'] });
  const noMap = JSON.stringify(await map.json());
  report.check('no login', 'map: a request without walls has none (200)', map.status === 200 && noMap === '{"map":null}', noMap.slice(0, 80));

  const seen = rows(await p.as('inspector').from('inspection_requests')
    .select('requested_by, requester_name, requester_phone, attachment_ids').eq('project_id', p.projectId).eq('items', items), 'inspector row');
  const row = seen[0] ?? {};
  report.check('no login', 'inspector: the visitor\'s contact and photo on the request',
    seen.length === 1 && row['requested_by'] === null && row['requester_name'] === 'Probe Visitor' && row['requester_phone'] === '555 010 2030'
      && Array.isArray(row['attachment_ids']) && row['attachment_ids'].length === 1, JSON.stringify(row));
  const subRows = rows(await p.as('sub').from('inspection_requests').select('id').eq('project_id', p.projectId).eq('items', items), 'sub rows');
  const subDay = rows(await p.as('sub').rpc('ir_calendar', { p_project_id: p.projectId, p_from: receipt['request_date'], p_to: receipt['request_date'] }),
    'sub calendar');
  report.check('no login', 'a sub: the visitor\'s request only anonymized',
    subRows.length === 0 && subDay.every((r) => r['full_detail'] === false || r['company'] !== 'Probe Framing'), `${subRows.length} rows`);

  const req = p.as('requester');
  const folders = rows(await req.from('folders').select('id').eq('project_id', p.projectId), 'requester folders');
  const people = rows(await req.from('project_members').select('id').eq('project_id', p.projectId), 'requester people');
  const rfis = rows(await req.from('rfis').select('id').eq('project_id', p.projectId), 'requester rfis');
  report.check('requester', 'no folders, no people but themselves, no RFIs',
    folders.length === 0 && people.length === 1 && rfis.length === 0, `${folders.length} folders, ${people.length} people, ${rfis.length} RFIs`);
  const week = await req.rpc('ir_calendar', { p_project_id: p.projectId, p_from: receipt['request_date'], p_to: receipt['request_date'] });
  report.check('requester', 'the job\'s request day in the app', week.error === null, week.error?.message ?? '');
}
