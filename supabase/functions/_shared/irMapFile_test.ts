// `deno test supabase/functions/_shared/irMapFile_test.ts` — the map PDF's facts, signer and content (0056, 0057).
import { contentHash } from './crypto.ts';
import { mapContent, type MapFacts, mapFactsSchema, permitLine, signerOf, titleOf } from './irMapFile.ts';

function check(ok: boolean, what: string): void {
  if (!ok) throw new Error(`failed: ${what}`);
}

const FACTS = {
  request_id: '00000000-0000-4000-8000-000000000001',
  project_id: '00000000-0000-4000-8000-000000000002',
  number: 377,
  ofs_number: 65,
  phase: 'PH III',
  request_date: '2026-10-05',
  what: 'Level 02 HOW Cavity Stuff',
  sheet_file_id: '00000000-0000-4000-8000-000000000003',
  page: 1,
  strokes: [{ c: 1, w: 0.01, p: [[0.1, 0.1], [0.2, 0.2]] }],
  legend: [{ color: 1, name: 'HOW Cavity Stuff' }],
  signer_name: 'Sample Deputy',
  map_file_id: null,
  stale: true,
};

const SIGNED = { result: 'approved' as const, signed_at: '2026-10-05T20:00:00Z', signed_by: '00000000-0000-4000-8000-000000000004', content_hash: 'a'.repeat(64) };

Deno.test('facts: what ir_map_context and link_request_map_facts answer, extra keys dropped', () => {
  const f = mapFactsSchema.parse({ ...FACTS, can_edit: true, signed_at: null, result: null, version: 3 });
  check(!('can_edit' in f) && f.number === 377, 'parsed');
  check(!mapFactsSchema.safeParse({ ...FACTS, legend: [1, 2, 3, 4].map((n) => ({ color: 1, name: String(n) })) }).success, '3 colors at most');
});

Deno.test('title: OSFM\'s order', () => {
  check(titleOf(mapFactsSchema.parse(FACTS)) === 'IR 377 - OFS IR #0065 - PH III - 2026-10-05 - Level 02 HOW Cavity Stuff', 'title');
});

Deno.test('signer: only a passed, signed IR is stamped', () => {
  const s = signerOf(SIGNED, ' Sample Deputy ');
  check(s !== null && s.name === 'Sample Deputy' && s.irHash === 'a'.repeat(64), 'signed and passed');
  check(signerOf(SIGNED, null)?.name === 'Inspector', 'no name: the role word');
  check(signerOf({ ...SIGNED, result: 'not_approved' }, 'x') === null, 'not passed');
  check(signerOf({ ...SIGNED, signed_at: null }, 'x') === null, 'not signed');
  check(signerOf({ ...SIGNED, result: null }, 'x') === null, 'no result');
});

Deno.test('content: the hash moves with what the map shows, not with its stale mark or file', async () => {
  const facts: MapFacts = mapFactsSchema.parse(FACTS);
  const base = await contentHash(mapContent(facts, null));
  check(base === await contentHash(mapContent({ ...facts, stale: false, map_file_id: '00000000-0000-4000-8000-000000000009' }, null)),
    'stale and the file on record are not the picture');
  check(base !== await contentHash(mapContent({ ...facts, strokes: [{ c: 2, w: 0.01, p: [[0.1, 0.1], [0.2, 0.2]] }] }, null)), 'strokes');
  check(base !== await contentHash(mapContent({ ...facts, page: 2 }, null)), 'page');
  check(base !== await contentHash(mapContent({ ...facts, what: 'Level 03 HOW Cavity Stuff' }, null)), 'title');
  check(base !== await contentHash(mapContent(facts, signerOf(SIGNED, 'Sample Deputy'))), 'the signature');
});

const READY = { previous: 'yes', trade: 'yes', gc: 'yes', ior: 'na', special: 'na' } as const;

Deno.test('facts (0061): the checklist and the permit number, both optional; a bad checklist is refused', () => {
  const old = mapFactsSchema.parse(FACTS);
  check(old.readiness === null && old.permit_number === null, 'a map before 0061: neither');
  const f = mapFactsSchema.parse({ ...FACTS, readiness: READY, permit_number: '24-0001' });
  check(f.readiness?.ior === 'na' && permitLine(f) === 'Permit 24-0001', 'parsed');
  check(permitLine(old) === null, 'no permit, no line');
  check(!mapFactsSchema.safeParse({ ...FACTS, readiness: { ...READY, gc: 'no' } }).success, 'Yes or N/A only');
});

Deno.test('content (0061): a map with no permit and no checklist keeps its hash; each moves it', async () => {
  const facts: MapFacts = mapFactsSchema.parse(FACTS);
  const base = await contentHash(mapContent(facts, null));
  check(base === await contentHash(mapContent({ ...facts, readiness: null, permit_number: null }, null)), 'none: same hash');
  check(base !== await contentHash(mapContent({ ...facts, permit_number: '24-0001' }, null)), 'the permit');
  check(base !== await contentHash(mapContent({ ...facts, readiness: READY }, null)), 'the checklist');
});
