// `deno test supabase/functions/_shared/requestFiles_test.ts` — a no-login request's files: type by bytes, names, limits.
import { HttpError } from './http.ts';
import { checkedFiles, MAX_FILE_BYTES, payloadOf, safeName, sniff } from './requestFiles.ts';

function check(ok: boolean, what: string): void {
  if (!ok) throw new Error(`failed: ${what}`);
}

function bytes(head: number[] | string, size = 64): Uint8Array<ArrayBuffer> {
  const b = new Uint8Array(size);
  const start = typeof head === 'string' ? Array.from(head, (c) => c.charCodeAt(0)) : head;
  b.set(start);
  return b;
}

const JPEG = bytes([0xff, 0xd8, 0xff, 0xe0]);
const PNG = bytes([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const WEBP = bytes('RIFF\u0000\u0000\u0000\u0000WEBPVP8 ');
const PDF = bytes('%PDF-1.7\n');

async function refused(form: FormData, what: string): Promise<void> {
  let status = 0;
  try {
    await checkedFiles(form);
  } catch (e) {
    status = e instanceof HttpError ? e.status : -1;
  }
  check(status === 400, `${what}: a plain 400 (got ${status})`);
}

Deno.test('sniff: JPEG, PNG, WebP and PDF by their bytes; nothing else', () => {
  check(sniff(JPEG)?.mime === 'image/jpeg', 'jpeg');
  check(sniff(PNG)?.mime === 'image/png', 'png');
  check(sniff(WEBP)?.mime === 'image/webp', 'webp');
  check(sniff(PDF)?.mime === 'application/pdf', 'pdf');
  check(sniff(bytes('<svg xmlns="http://www.w3.org/2000/svg">')) === null, 'svg');
  check(sniff(bytes('<!doctype html><script>')) === null, 'html');
  check(sniff(bytes([0x4d, 0x5a, 0x90, 0x00])) === null, 'exe');
  check(sniff(bytes('\u0000\u0000\u0000\u0018ftypheic')) === null, 'heic (the app sends photos as JPEG)');
  check(sniff(new Uint8Array([0xff, 0xd8, 0xff])) === null, 'too short to tell');
});

Deno.test('safeName: no folders or control characters, the true extension', () => {
  check(safeName('IMG 0042.HEIC', 'jpg') === 'IMG 0042.jpg', 'extension follows the bytes');
  check(safeName('../../etc/passwd', 'pdf') === 'passwd.pdf', 'no folders');
  check(safeName('C:\\Users\\me\\wall.png', 'png') === 'wall.png', 'no Windows folders');
  check(safeName('a\u0000b\u001fc.jpg', 'jpg') === 'abc.jpg', 'no control characters');
  check(safeName('', 'pdf') === 'Attachment.pdf' && safeName('...', 'pdf') === 'Attachment.pdf', 'a name when none is left');
  check(safeName(`${'x'.repeat(200)}.jpg`, 'jpg').length === 84, 'at most 80 characters before the extension');
});

Deno.test('checkedFiles: up to 3 photos or PDFs, each 10 MB at most, hashed', async () => {
  const form = new FormData();
  form.append('payload', '{}');
  form.append('file', new File([JPEG], 'wall.jpg', { type: 'text/html' }));
  form.append('file', new File([PDF], 'detail', { type: 'image/png' }));
  const files = await checkedFiles(form);
  check(files.length === 2, 'two files');
  check(files[0]?.mime === 'image/jpeg' && files[1]?.mime === 'application/pdf', 'the type the bytes say, not the browser');
  check(files[1]?.name === 'detail.pdf', 'the extension added');
  check(/^[0-9a-f]{64}$/.test(files[0]?.sha256 ?? ''), 'sha256');
  check((await checkedFiles(new FormData())).length === 0, 'no files is fine');

  const four = new FormData();
  for (let i = 0; i < 4; i += 1) four.append('file', new File([JPEG], `p${i}.jpg`));
  await refused(four, 'four files');
  const svg = new FormData();
  svg.append('file', new File([bytes('<svg onload="x()">')], 'a.jpg'));
  await refused(svg, 'an SVG named .jpg');
  const empty = new FormData();
  empty.append('file', new File([], 'a.jpg'));
  await refused(empty, 'an empty file');
  const big = new FormData();
  big.append('file', new File([JPEG, new Uint8Array(MAX_FILE_BYTES)], 'big.jpg'));
  await refused(big, 'over 10 MB');
  const text = new FormData();
  text.append('file', 'not a file');
  await refused(text, 'a text field named file');
});

Deno.test('payloadOf: the payload field only, with files beside it', () => {
  const form = new FormData();
  form.append('payload', '{"action":"submit"}');
  form.append('file', new File([JPEG], 'a.jpg'));
  check(payloadOf(form) === '{"action":"submit"}', 'payload');
  const extra = new FormData();
  extra.append('payload', '{}');
  extra.append('storage_path', 'project/x');
  let threw = false;
  try {
    payloadOf(extra);
  } catch (e) {
    threw = e instanceof HttpError && e.status === 400;
  }
  check(threw, 'no other fields');
  let missing = false;
  try {
    payloadOf(new FormData());
  } catch (e) {
    missing = e instanceof HttpError && e.status === 400;
  }
  check(missing, 'payload is required');
});
