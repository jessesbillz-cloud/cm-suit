// `deno test --config supabase/functions/deno.json supabase/functions/_shared/permitStamp_test.ts`
import { STAMP_MAX_BYTES, approvedName, looksLikePdf, stampHash, tooLargeMessage } from './permitStamp.ts';

function check(ok: boolean, what: string): void {
  if (!ok) throw new Error(`failed: ${what}`);
}

const FACTS = {
  permitId: '00000000-0000-4000-8000-000000000001',
  permitNumber: '24-0001',
  sourceFileId: '00000000-0000-4000-8000-000000000002',
  stampedBy: '00000000-0000-4000-8000-000000000003',
  stampedAt: '2026-10-01T17:05:00.000Z',
};

Deno.test('permit stamp: the hash is the same for the same facts and changes with any of them', async () => {
  const h = await stampHash(FACTS);
  check(/^[0-9a-f]{64}$/.test(h), 'sha256 hex');
  check(h === (await stampHash({ ...FACTS })), 'same facts, same hash');
  check(h === (await stampHash({ ...FACTS, stampedAt: '2026-10-01T10:05:00-07:00' })), 'the same instant written another way');
  for (const k of Object.keys(FACTS) as (keyof typeof FACTS)[]) {
    const other = k === 'stampedAt' ? '2026-10-01T17:05:01.000Z' : `${FACTS[k]}x`;
    check(h !== (await stampHash({ ...FACTS, [k]: other })), `${k} changes it`);
  }
});

Deno.test('permit stamp: the stamped copy keeps its name, plus " - Approved <number>.pdf"', () => {
  check(approvedName('Sample A-101 Floor Plan.pdf', '24-0001') === 'Sample A-101 Floor Plan - Approved 24-0001.pdf', 'plain');
  check(approvedName('Sample Set.PDF', ' 25-0102 ') === 'Sample Set - Approved 25-0102.pdf', 'any case, trimmed');
  check(approvedName('Sample a/b: set.pdf', '24/0001') === 'Sample a-b- set - Approved 24-0001.pdf', 'no path characters');
  check(approvedName('.pdf', '24-0001') === 'Sheet - Approved 24-0001.pdf', 'never an empty name');
});

Deno.test('permit stamp: too large says how large, in plain words', () => {
  check(tooLargeMessage(180 * 1024 * 1024) === 'Too large to stamp here (180 MB). Split the set or ask us.', 'the message');
  check(STAMP_MAX_BYTES >= 50 * 1024 * 1024 && STAMP_MAX_BYTES <= 150 * 1024 * 1024, 'a limit an edge function can hold');
});

Deno.test('permit stamp: a PDF is recognized by its header', () => {
  const enc = new TextEncoder();
  check(looksLikePdf(enc.encode('%PDF-1.7\n...')), 'a PDF');
  check(looksLikePdf(enc.encode('﻿  %PDF-1.4')), 'a little junk before the header');
  check(!looksLikePdf(enc.encode('PK\u0003\u0004 a zip')), 'not a zip');
});
