// `deno test supabase/functions/_shared/requestLinkRevs_test.ts` — the request link's revs and map contract (0057).
import { HttpError } from './http.ts';
import { ipOrNull, isMapRequest, LinkBody, mapAnswer, mapFileOf, revsAnswer, submitPayload } from './requestLinkRevs.ts';

function check(ok: boolean, what: string): void {
  if (!ok) throw new Error(`failed: ${what}`);
}

function throws(fn: () => unknown): boolean {
  try {
    fn();
  } catch {
    return true;
  }
  return false;
}

const TOKEN = 'A'.repeat(43);
const PROJECT = '00000000-0000-4000-8000-000000000001';
const LIST = '00000000-0000-4000-8000-000000000002';
const REV = '00000000-0000-4000-8000-000000000003';
const ITEM = '00000000-0000-4000-8000-000000000004';
const AREA = '00000000-0000-4000-8000-000000000005';
const SHEET = '00000000-0000-4000-8000-000000000006';
const USER = '00000000-0000-4000-8000-000000000007';
const STROKE = { c: 1, w: 0.01, p: [[0.1, 0.1], [0.2, 0.2]] };

Deno.test('actions: revs by the link token; the map actions by the receipt; each strict', () => {
  const revs = LinkBody.safeParse({ action: 'revs', project_id: PROJECT, token: TOKEN });
  check(revs.success && !isMapRequest(revs.data), 'revs: a token action');
  for (const action of ['map', 'sheet', 'map_render', 'map_download']) {
    const b = LinkBody.safeParse({ action, project_id: PROJECT, receipt: TOKEN });
    check(b.success && isMapRequest(b.data), `${action}: by the receipt`);
  }
  const save = LinkBody.safeParse({ action: 'map_save', project_id: PROJECT, receipt: TOKEN, version: 2, strokes: [STROKE], sheet_file_id: null, page: null });
  check(save.success && isMapRequest(save.data), 'map_save');
  const status = LinkBody.safeParse({ action: 'status', project_id: PROJECT, receipt: TOKEN });
  check(status.success && !isMapRequest(status.data), 'status stays 0055\'s');
  const bad = [
    { action: 'revs', project_id: PROJECT, receipt: TOKEN },
    { action: 'map', project_id: PROJECT, token: TOKEN },
    // A map is opened by its receipt alone: never by a request id.
    { action: 'map', project_id: PROJECT, receipt: TOKEN, request_id: PROJECT },
    { action: 'map', project_id: PROJECT, receipt: 'short' },
    { action: 'map_save', project_id: PROJECT, receipt: TOKEN, version: 0, strokes: [], sheet_file_id: null, page: null },
    { action: 'map_save', project_id: PROJECT, receipt: TOKEN, version: 1, strokes: [{ ...STROKE, c: 4 }], sheet_file_id: null, page: null },
    { action: 'map_save', project_id: PROJECT, receipt: TOKEN, version: 1, strokes: [{ ...STROKE, w: 0.2 }], sheet_file_id: null, page: null },
    { action: 'map_save', project_id: PROJECT, receipt: TOKEN, version: 1, strokes: [{ ...STROKE, p: [[0, 0]] }], sheet_file_id: null, page: null },
    { action: 'map_save', project_id: PROJECT, receipt: TOKEN, version: 1, strokes: [{ ...STROKE, p: [[0, 0], [1.2, 0]] }], sheet_file_id: null, page: null },
    { action: 'map_save', project_id: PROJECT, receipt: TOKEN, version: 1, strokes: [{ ...STROKE, x: 1 }], sheet_file_id: null, page: null },
    { action: 'map_save', project_id: PROJECT, receipt: TOKEN, version: 1, strokes: Array(301).fill(STROKE), sheet_file_id: null, page: null },
    { action: 'map_save', project_id: PROJECT, receipt: TOKEN, version: 1, strokes: [], sheet_file_id: 'x', page: null },
    { action: 'map_save', project_id: PROJECT, receipt: TOKEN, version: 1, strokes: [], sheet_file_id: null, page: 0 },
    { action: 'submit', project_id: PROJECT, token: TOKEN },
  ];
  for (const b of bad) check(!LinkBody.safeParse(b).success, `refused: ${JSON.stringify(b).slice(0, 90)}`);
});

const SUBMIT = {
  action: 'submit',
  project_id: PROJECT,
  token: TOKEN,
  name: ' Sample Visitor ',
  company: 'Sample Firestop',
  phone: '(555) 010-2030',
  email: '',
  date: '2026-10-05',
  time: '09:30',
  duration_kind: 'timed',
  duration_min: 60,
  notice_ack: true,
};
const READY = { previous: 'yes', trade: 'yes', gc: 'yes', ior: 'yes', special: 'na' };
const OFS = { ...SUBMIT, area_ids: [AREA], item_ids: [ITEM], sheet_file_id: null, readiness: READY };

Deno.test('submit payload: walls make it the revs request; otherwise 0055\'s request', () => {
  const ofs = submitPayload(JSON.stringify(OFS));
  check(ofs.ofs && ofs.body.name === 'Sample Visitor' && ofs.body.area_ids[0] === AREA, 'the revs request, trimmed');
  const plain = submitPayload(JSON.stringify({ ...SUBMIT, kind: 'ior', special_kind_id: null, items: 'North wall' }));
  check(!plain.ofs && plain.body.items === 'North wall', '0055\'s request');
  const bad = [
    { ...OFS, item_ids: [ITEM, ITEM, ITEM, ITEM] },
    { ...OFS, item_ids: [] },
    { ...OFS, area_ids: [] },
    { ...OFS, area_ids: Array(201).fill(AREA) },
    { ...OFS, phone: '', email: '' },
    { ...OFS, duration_min: null },
    // The database composes what to inspect; the visitor never sends it, a kind, a number or an uploader.
    { ...OFS, items: 'Anything' },
    { ...OFS, kind: 'ofs' },
    { ...OFS, number: 1 },
    { ...OFS, requested_by: USER },
    { ...OFS, sheet_file_id: 'not-a-uuid' },
    // The readiness checklist (0061): all five, Yes or N/A.
    { ...OFS, readiness: undefined },
    { ...OFS, readiness: { ...READY, special: 'no' } },
    { ...OFS, readiness: { ...READY, previous: undefined } },
  ];
  for (const b of bad) {
    let refused = false;
    try {
      submitPayload(JSON.stringify(b));
    } catch (e) {
      refused = e instanceof HttpError && e.status === 400;
    }
    check(refused, `refused with 400: ${JSON.stringify(b).slice(0, 90)}`);
  }
  check(throws(() => submitPayload('[1, 2]')) && throws(() => submitPayload('not json')), 'an object, as JSON');
});

Deno.test('revs answer: the walls and status only; failed is never a status here', () => {
  const out = revsAnswer({
    lists: [{ id: LIST, name: 'Sample Rated Walls', phase: 'PH III', position: 1, permit_id: PROJECT, created_by: USER }],
    revs: [{ id: REV, list_id: LIST, number: 0, name: 'TOW', version: 3 }],
    items: [{ id: ITEM, rev_id: REV, name: 'TOW - Speed Plugs', company: null, position: 1, deleted_at: null }],
    areas: [{ id: AREA, list_id: LIST, level: 'Level 01', name: 'Shaftwall A', sheet_file_id: SHEET, position: 1, created_by: USER }],
    status: [{ area_id: AREA, item_id: ITEM, status: 'requested', ir_number: 12, ofs_number: 4, note: 'Gaps', request_id: PROJECT }],
  });
  const text = JSON.stringify(out);
  check(!text.includes(USER) && !text.includes('Gaps') && !text.includes('ir_number') && !text.includes('permit_id'),
    'no people, notes, numbers or permit');
  check(JSON.stringify(Object.keys(out.status[0] ?? {}).sort()) === JSON.stringify(['area_id', 'item_id', 'status']), 'status keys');
  check(throws(() => revsAnswer({ ...out, status: [{ area_id: AREA, item_id: ITEM, status: 'failed' }] })), 'failed fails loudly');
});

const MAP = {
  number: 12,
  ofs_number: 4,
  phase: 'PH III',
  request_date: '2026-10-05',
  what: 'Level 01 TOW - Speed Plugs',
  sheet_file_id: SHEET,
  page: 1,
  strokes: [STROKE],
  legend: [{ color: 1, name: 'TOW - Speed Plugs' }],
  result: null,
  signed: false,
  version: 2,
  has_map: false,
  stale: true,
  can_edit: true,
  sheets: [{ file_id: SHEET, label: 'Level 01' }],
};

Deno.test('map answer: the visitor\'s map, never the signer, the ids or the PDF\'s file', () => {
  const out = mapAnswer({ map: { ...MAP, request_id: PROJECT, project_id: PROJECT, signer_name: 'Ivy Inspector', map_file_id: USER, signed_at: null } });
  const text = JSON.stringify(out);
  check(!text.includes('Ivy') && !text.includes(USER) && !text.includes('request_id') && !text.includes('project_id'), 'stripped');
  check(JSON.stringify(Object.keys(out.map ?? {}).sort()) === JSON.stringify(Object.keys(MAP).sort()), 'keys');
  check(mapAnswer({ map: null }).map === null, 'a request without walls: no map');
  check(throws(() => mapAnswer({ map: { ...MAP, legend: [1, 2, 3, 4].map((c) => ({ color: 1, name: String(c) })) } })), 'three colors at most');
});

Deno.test('map file: the path and name the function signs a URL for', () => {
  const f = mapFileOf({ storage_path: 'project/a/b/c/map.pdf', original_name: 'IR 12 Map.pdf', mime: 'application/pdf', sha256: 'f'.repeat(64) });
  check(f.original_name === 'IR 12 Map.pdf' && !JSON.stringify(f).includes('fff'), 'path, name, type');
  check(throws(() => mapFileOf({ storage_path: '', original_name: 'x', mime: 'application/pdf' })), 'a path is required');
});

Deno.test('the visitor\'s address: kept when it looks like one, else none', () => {
  check(ipOrNull('203.0.113.9') === '203.0.113.9', 'IPv4');
  check(ipOrNull(' 2001:db8::1 ') === '2001:db8::1', 'IPv6, trimmed');
  check(ipOrNull('1:2:3:4:5:6:7:8') === '1:2:3:4:5:6:7:8', 'IPv6, all groups');
  for (const bad of ['unknown', '', null, '999.1.1.1', '1::2::3', ':::', '1:2', 'x:y:z', '<script>']) {
    check(ipOrNull(bad) === null, `none: ${String(bad)}`);
  }
});
