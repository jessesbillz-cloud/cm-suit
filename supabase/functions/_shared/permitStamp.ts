// The official's approval stamp on a permit's plans (migration 0053, permit-stamp): the record's content hash, the
// stamped copy's filename and the size limit. Pure, unit-tested in permitStamp_test.ts.
import { buildFilename } from './buildFilename.ts';
import { contentHash } from './crypto.ts';

/**
 * The biggest PDF stamped in one request. pdf-lib holds the file, every object it parses (stream bytes are copied) and
 * the saved copy at once. Measured with Deno 2 on synthetic 40-sheet sets (scratch/stamp-render/big.ts): peak memory
 * is about 85 MB of runtime plus 3.1x the file (20 MB: 154 MB, 40 MB: 215 MB, 60 MB: 274 MB, 100 MB: 394 MB), and an
 * edge function has 256 MB. 50 MB keeps a margin; OSFM-style sets are one PDF per sheet, far smaller. Bigger files are
 * refused in plain words (split the set), until a worker with more memory stamps them.
 */
export const STAMP_MAX_BYTES = 50 * 1024 * 1024;

/** "Too large to stamp here (180 MB). Split the set or ask us." */
export function tooLargeMessage(bytes: number): string {
  return `Too large to stamp here (${String(Math.ceil(bytes / (1024 * 1024)))} MB). Split the set or ask us.`;
}

/** What one stamped sheet asserts: who approved which original for which permit, and when. */
export interface StampFacts {
  permitId: string;
  permitNumber: string;
  sourceFileId: string;
  stampedBy: string;
  /** ISO instant the stamp was made (its day, in the job's zone, is printed on it). */
  stampedAt: string;
}

/** SPEC §6.9 content hash of one stamped sheet: the same facts always give the same hash, at stamping and recording. */
export function stampHash(f: StampFacts): Promise<string> {
  return contentHash({
    kind: 'permit_approval',
    permit_id: f.permitId,
    permit_number: f.permitNumber,
    source_file_id: f.sourceFileId,
    stamped_by: f.stampedBy,
    stamped_at: new Date(f.stampedAt).toISOString(),
  });
}

/** "A-101 Floor Plan.pdf" + "24-0001" -> "A-101 Floor Plan - Approved 24-0001.pdf". */
export function approvedName(original: string, permitNumber: string): string {
  const stem = original.replace(/\.pdf$/i, '').trim().slice(0, 300) || 'Sheet';
  return buildFilename('{Name} - Approved {Permit}.pdf', { fields: { Name: stem, Permit: permitNumber.trim() } });
}

/** A PDF starts with "%PDF-" (allowing a little junk before it, as readers do). */
export function looksLikePdf(bytes: Uint8Array): boolean {
  const head = new TextDecoder('latin1').decode(bytes.subarray(0, 1024));
  return head.includes('%PDF-');
}
