// `deno test --allow-env supabase/functions/_shared/mdrFiles_test.ts` — MDR file links: MDR's host only, 250 MB, types.
import { HttpError } from './http.ts';
import { mdrHost, mdrNameOf, MdrRefused, mdrSourceUrl, readCapped, typed } from './mdrFiles.ts';

function check(ok: boolean, what: string): void {
  if (!ok) throw new Error(`failed: ${what}`);
}

const HOST = 'mdr.example.test';
const GOOD = `https://${HOST}/storage/v1/object/public/inspection-files/job/IR%20344.pdf`;

function refused(raw: string, what: string): void {
  let hit = false;
  try {
    mdrSourceUrl(raw, HOST);
  } catch (e) {
    hit = e instanceof MdrRefused;
  }
  check(hit, `${what}: refused`);
}

Deno.test('mdrSourceUrl: a public object on MDR\'s host over https, nothing else', () => {
  check(mdrSourceUrl(GOOD, HOST).hostname === HOST, 'MDR\'s own link');
  refused(GOOD.replace(HOST, 'other.example.test'), 'another host');
  refused(GOOD.replace(HOST, `${HOST}.evil.test`), 'a look-alike host');
  refused(GOOD.replace(HOST, `evil.${HOST}`), 'a subdomain');
  refused(GOOD.replace('https:', 'http:'), 'plain http');
  refused(GOOD.replace(HOST, `${HOST}:8443`), 'another port');
  refused(GOOD.replace(HOST, `user:pw@${HOST}`), 'a login in the link');
  refused(`https://${HOST}/storage/v1/object/sign/inspection-files/x.pdf`, 'a signed (private) object');
  refused(`https://${HOST}/rest/v1/inspection_requests`, 'the API');
  refused('not a link', 'not a link');
});

Deno.test('mdrHost: refuses when MDR_PUBLIC_HOST is unset or not a host', () => {
  const was = Deno.env.get('MDR_PUBLIC_HOST');
  try {
    Deno.env.delete('MDR_PUBLIC_HOST');
    let status = 0;
    try {
      mdrHost();
    } catch (e) {
      status = e instanceof HttpError ? e.status : -1;
    }
    check(status === 500, `unset: refused (got ${status})`);
    Deno.env.set('MDR_PUBLIC_HOST', 'https://x.test/path');
    status = 0;
    try {
      mdrHost();
    } catch (e) {
      status = e instanceof HttpError ? e.status : -1;
    }
    check(status === 500, `a URL instead of a host: refused (got ${status})`);
    Deno.env.set('MDR_PUBLIC_HOST', ' MDR.Example.Test ');
    check(mdrHost() === HOST, 'trimmed and lower-cased');
  } finally {
    if (was === undefined) Deno.env.delete('MDR_PUBLIC_HOST');
    else Deno.env.set('MDR_PUBLIC_HOST', was);
  }
});

Deno.test('mdrNameOf and typed: MDR\'s name, the true type', () => {
  check(mdrNameOf(new URL(GOOD)) === 'IR 344.pdf', 'decoded');
  check(mdrNameOf(new URL(`https://${HOST}/storage/v1/object/public/a/100%.pdf`)) === '100%.pdf', 'a bad escape kept as is');
  const pdf = new TextEncoder().encode('%PDF-1.7\n0123456789');
  check(typed(pdf, 'IR 344.jpg').mime === 'application/pdf' && typed(pdf, 'IR 344.jpg').name === 'IR 344.pdf', 'pdf by bytes');
  const doc = new TextEncoder().encode('PK\u0003\u0004 not a photo at all');
  check(typed(doc, 'Mix design.docx').mime === 'application/octet-stream', 'other bytes stay plain');
  check(typed(doc, 'Mix design.docx').name === 'Mix design.docx', 'with their extension');
});

Deno.test('readCapped: refuses past the limit, by header and by bytes', async () => {
  let hit = false;
  try {
    await readCapped(new Response('x', { headers: { 'content-length': '999' } }), 10);
  } catch (e) {
    hit = e instanceof MdrRefused;
  }
  check(hit, 'announced too large');
  hit = false;
  try {
    await readCapped(new Response('0123456789abc'), 10);
  } catch (e) {
    hit = e instanceof MdrRefused;
  }
  check(hit, 'arrived too large');
  check((await readCapped(new Response('0123'), 10)).length === 4, 'small enough');
});
