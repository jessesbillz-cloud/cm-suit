// What a picked schedule file is, from its first bytes (and its name only where bytes can't tell, a CSV): one button
// takes any file and this decides. The formats we can't read yet answer what to send instead (research §6.1): an .mpp
// is saved as XML from Project, a P6 XML is exported as XER, an Excel file is saved as CSV. Pure: no I/O.
import { looksLikeMspdi } from './mspdi.ts';
import type { SourceKind } from './rows.ts';
import { looksLikeXer } from './xer.ts';

export type Detected =
  | { kind: SourceKind; mediaType: string }
  | { refuse: string; message: string };

function startsWith(bytes: Uint8Array, sig: readonly number[], at = 0): boolean {
  return sig.every((b, i) => bytes[at + i] === b);
}

function ascii(bytes: Uint8Array, from: number, to: number): string {
  return String.fromCharCode(...bytes.subarray(from, to));
}

function extOf(name: string): string {
  return /\.([a-z0-9]+)$/i.exec(name)?.[1]?.toLowerCase() ?? '';
}

const UNKNOWN = 'This file can\'t be read. Upload a P6 XER, a Project XML, a CSV, a PDF or a photo.';

/** `head`: the file's first bytes (4 KB is plenty). */
export function detectKind(name: string, mime: string, head: Uint8Array): Detected {
  const ext = extOf(name);
  if (startsWith(head, [0x25, 0x50, 0x44, 0x46, 0x2d])) return { kind: 'pdf', mediaType: 'application/pdf' };
  if (startsWith(head, [0x89, 0x50, 0x4e, 0x47])) return { kind: 'photo', mediaType: 'image/png' };
  if (startsWith(head, [0xff, 0xd8, 0xff])) return { kind: 'photo', mediaType: 'image/jpeg' };
  if (startsWith(head, [0x47, 0x49, 0x46, 0x38])) return { kind: 'photo', mediaType: 'image/gif' };
  if (ascii(head, 0, 4) === 'RIFF' && ascii(head, 8, 12) === 'WEBP') return { kind: 'photo', mediaType: 'image/webp' };
  if (ascii(head, 4, 8) === 'ftyp') {
    return { refuse: 'photo_format', message: 'This photo format can\'t be read. Upload a JPEG or a screenshot.' };
  }
  // Office files: Excel (.xlsx is a zip, .xls and .mpp are OLE).
  const zip = startsWith(head, [0x50, 0x4b, 0x03, 0x04]);
  const ole = startsWith(head, [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);
  if (ext === 'mpp' || (ole && /project/i.test(mime))) {
    return { refuse: 'mpp', message: 'In Project: File > Save As > XML, then upload that file.' };
  }
  if (zip || ole) {
    return ['xlsx', 'xlsm', 'xls'].includes(ext)
      ? { refuse: 'excel', message: 'Save the sheet as CSV, then upload that file.' }
      : { refuse: 'unknown', message: UNKNOWN };
  }
  const text = new TextDecoder('utf-8').decode(head);
  if (looksLikeXer(text)) return { kind: 'xer', mediaType: 'text/plain' };
  if (looksLikeMspdi(text)) return { kind: 'msp_xml', mediaType: 'application/xml' };
  if (/<APIBusinessObjects[\s>]/.test(text)) {
    return { refuse: 'p6_xml', message: 'From P6, export the schedule as XER, then upload that file.' };
  }
  const type = mime.split(';')[0]?.trim().toLowerCase() ?? '';
  if (ext === 'csv' || type === 'text/csv' || (ext === 'txt' && text.split('\n', 1)[0]?.includes(','))) {
    return { kind: 'csv', mediaType: 'text/csv' };
  }
  return { refuse: 'unknown', message: UNKNOWN };
}
