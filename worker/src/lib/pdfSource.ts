// Get a PDF for a stored file: the original if it is a PDF, or a LibreOffice conversion for Word/Excel files.
import { access } from 'node:fs/promises';
import { join } from 'node:path';
import type { Db } from './supabase.js';
import { runOk } from './exec.js';
import { downloadToFile } from './storage.js';
import { FILES_BUCKET, type FileRow } from './files.js';

type SourceKind = 'pdf' | 'office' | 'image' | 'other';

// Extension used for the temp copy so LibreOffice picks the right import filter. Never the user's filename.
const OFFICE_TYPES = new Map<string, string>([
  ['application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'docx'],
  ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'xlsx'],
  ['application/msword', 'doc'],
  ['application/vnd.ms-excel', 'xls'],
]);

const CONVERT_TIMEOUT_MS = 10 * 60 * 1000;
const PDFINFO_TIMEOUT_MS = 2 * 60 * 1000;

export function classifyMime(mime: string): SourceKind {
  const base = mime.split(';')[0]?.trim().toLowerCase() ?? '';
  if (base === 'application/pdf') return 'pdf';
  if (OFFICE_TYPES.has(base)) return 'office';
  if (base.startsWith('image/')) return 'image';
  return 'other';
}

/** Download the file into `dir` and return the path of a PDF of it. Only for kinds 'pdf' and 'office'. */
export async function materializePdf(db: Db, file: FileRow, dir: string): Promise<string> {
  const kind = classifyMime(file.mime);
  if (kind === 'pdf') {
    const target = join(dir, 'source.pdf');
    await downloadToFile(db, FILES_BUCKET, file.storage_path, target);
    return target;
  }
  const ext = OFFICE_TYPES.get(file.mime.split(';')[0]?.trim().toLowerCase() ?? '');
  if (kind !== 'office' || ext === undefined) throw new Error(`cannot make a PDF from ${file.mime}`);

  const source = join(dir, `source.${ext}`);
  await downloadToFile(db, FILES_BUCKET, file.storage_path, source);
  const outDir = join(dir, 'converted');
  // A private profile per run lets conversions run in parallel (LibreOffice locks a shared profile).
  const profile = `file://${join(dir, 'lo-profile')}`;
  await runOk(
    'soffice',
    ['--headless', '--norestore', '--nologo', `-env:UserInstallation=${profile}`, '--convert-to', 'pdf', '--outdir', outDir, source],
    { timeoutMs: CONVERT_TIMEOUT_MS, env: { ...process.env, HOME: dir } },
  );
  const pdf = join(outDir, 'source.pdf');
  try {
    await access(pdf);
  } catch (err) {
    throw new Error(`LibreOffice did not produce a PDF for ${file.mime}`, { cause: err });
  }
  return pdf;
}

export async function pdfPageCount(pdfPath: string): Promise<number> {
  const { stdout } = await runOk('pdfinfo', [pdfPath], { timeoutMs: PDFINFO_TIMEOUT_MS });
  const match = /^Pages:\s+(\d+)\s*$/m.exec(stdout);
  if (!match?.[1]) throw new Error('pdfinfo did not report a page count');
  return Number(match[1]);
}
