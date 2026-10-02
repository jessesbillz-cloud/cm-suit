// Photos and PDFs sent with a no-login inspection request (request-link `submit`, SPEC §6.4 #4): read from the multipart
// form, checked by their own bytes (never the name or the type the browser claims), at most 3 of at most 10 MB each.
// The name keeps only what the visitor typed before the extension, and the extension follows the bytes. Pure apart from
// hashing, so the checks are unit-tested (requestFiles_test.ts).
import { sha256HexBytes } from './crypto.ts';
import { HttpError } from './http.ts';

export const MAX_FILES = 3;
export const MAX_FILE_BYTES = 10 * 1024 * 1024;
/** The files, the payload field and the form's boundaries. */
export const MAX_SUBMIT_BYTES = MAX_FILES * MAX_FILE_BYTES + 64 * 1024;
export const TOO_LARGE = 'Files must be 10 MB or less.';

export interface CheckedFile {
  name: string;
  mime: string;
  bytes: Uint8Array;
  sha256: string;
}

const KINDS: { mime: string; ext: string; test: (b: Uint8Array) => boolean }[] = [
  { mime: 'image/jpeg', ext: 'jpg', test: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  { mime: 'image/png', ext: 'png', test: (b) => [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((x, i) => b[i] === x) },
  { mime: 'image/webp', ext: 'webp', test: (b) => ascii(b, 0, 4) === 'RIFF' && ascii(b, 8, 12) === 'WEBP' },
  { mime: 'application/pdf', ext: 'pdf', test: (b) => ascii(b, 0, 5) === '%PDF-' },
];

function ascii(b: Uint8Array, from: number, to: number): string {
  return String.fromCharCode(...b.subarray(from, to));
}

/** The file's type by its first bytes: JPEG, PNG, WebP or PDF. Anything else (SVG, HTML, HEIC, ...) is null. */
export function sniff(bytes: Uint8Array): { mime: string; ext: string } | null {
  if (bytes.length < 12) return null;
  const hit = KINDS.find((k) => k.test(bytes));
  return hit ? { mime: hit.mime, ext: hit.ext } : null;
}

/** "IMG 0042.jpg" from whatever was sent: no folders, no control characters, at most 80 characters, the true extension. */
export function safeName(sent: string, ext: string): string {
  const base = sent.split(/[\\/]/).pop() ?? '';
  // deno-lint-ignore no-control-regex
  const stem = base.replace(/\.[^.]*$/, '').replace(/[\u0000-\u001f\u007f]/g, '').replace(/\s+/g, ' ').trim().slice(0, 80);
  return `${stem === '' || /^\.+$/.test(stem) ? 'Attachment' : stem}.${ext}`;
}

/** Only `payload` (the JSON fields) and `file` (up to 3) may be in the form. */
export function payloadOf(form: FormData): string {
  for (const key of form.keys()) {
    if (key !== 'payload' && key !== 'file') throw new HttpError(400, 'Invalid request');
  }
  const payload = form.get('payload');
  if (typeof payload !== 'string') throw new HttpError(400, 'Invalid request');
  return payload;
}

/** The form's files, checked. Throws a plain 400 for too many, too large, empty or not a photo or PDF. */
export async function checkedFiles(form: FormData): Promise<CheckedFile[]> {
  const sent = form.getAll('file');
  if (sent.length > MAX_FILES) throw new HttpError(400, 'Up to 3 photos or PDFs.');
  const out: CheckedFile[] = [];
  for (const f of sent) {
    if (typeof f === 'string') throw new HttpError(400, 'Invalid request');
    if (f.size === 0) throw new HttpError(400, 'A file is empty.');
    if (f.size > MAX_FILE_BYTES) throw new HttpError(400, TOO_LARGE);
    const bytes = new Uint8Array(await f.arrayBuffer());
    const kind = sniff(bytes);
    if (!kind) throw new HttpError(400, 'Photos or PDFs only.');
    out.push({ name: safeName(f.name, kind.ext), mime: kind.mime, bytes, sha256: await sha256HexBytes(bytes) });
  }
  return out;
}
