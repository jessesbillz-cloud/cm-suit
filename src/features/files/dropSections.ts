// The spec section every file going up in Files is filed under (Jesse, Oct 12: "Even on creation we could look through,
// determine the section and then put it somewhere in the title, hidden if we had to"; RFIs: "we'd have to read those").
// In order: its name (sectionOfName), else, for a PDF bound for Submittals, RFIs or CCDs, the words of its first 2 pages
// read here with pdf.js (sectionOfText, the job's spec book's sections first). Only when both say nothing does
// Submittals ask (SectionPrompt). The section goes into the file's hidden field right after the upload (0105 fill); a
// section from the words leaves the visible name as it is. A section on the job's fire list marks the file fire / life
// safety (0106 ofs_suggest).
import type { AfterUpload } from '../../data/UploadQueue';
import { fillFileSections } from '../../data/fileSection';
import { messageOf } from '../../data/errors';
import { suggestOfs } from '../../data/ofs';
import { leadText } from '../../lib/pdf/pdfjs';
import { sectionKey, sectionOfName } from '../specs/sections';
import { sectionOfText } from '../specs/sectionOfText';
import { sortDrop, type SectionKind } from './classify';
import type { DroppedFile } from './collectDrop';

/** The sections whose page reads a file by its section. */
const READS: ReadonlySet<SectionKind> = new Set(['submittals', 'rfis', 'ccd']);
/** pdf.js holds the whole file: past this the words are not read. */
const MAX_BYTES = 100 * 1024 * 1024;
const PAGES = 2;

const isPdf = (f: File) => f.type === 'application/pdf' || /\.pdf$/i.test(f.name);

/** The places in the drop of the files whose words are read: PDFs bound for those sections with no section in the name. */
export function toRead(dropped: readonly DroppedFile[], viewing: SectionKind): number[] {
  const bound = new Set<DroppedFile>();
  for (const g of sortDrop(dropped, viewing)) if (READS.has(g.kind ?? viewing)) for (const d of g.items) bound.add(d);
  return dropped.flatMap((d, at) =>
    bound.has(d) && isPdf(d.file) && d.file.size <= MAX_BYTES && sectionOfName(d.file.name) === null ? [at] : [],
  );
}

/** The section each read file's words give ("09 29 00"), by its place in the drop. A file pdf.js can't open gives none. */
export async function textSections(
  dropped: readonly DroppedFile[],
  at: readonly number[],
  book: readonly { section: string }[],
): Promise<Map<number, string>> {
  const out = new Map<number, string>();
  for (const n of at) {
    const d = dropped[n];
    if (d === undefined) continue;
    const text = await leadText(d.file, PAGES);
    const section = text === null ? null : sectionOfText(text, book);
    if (section !== null) out.set(n, section);
  }
  return out;
}

/**
 * The step after each upload: its section (the name's, which the prompt may have just given it, else the words') into
 * the file's hidden field. A refusal shows on the upload's line; the file stays up (trying again would add it twice).
 */
export function fileSectionStep(byText: ReadonlyMap<File, string>): AfterUpload {
  return async (fileId, file) => {
    const named = sectionOfName(file.name);
    const key = sectionKey(named ?? byText.get(file) ?? '');
    if (key === null) return null;
    try {
      await fillFileSections([{ fileId, section: key }]);
    } catch (e) {
      return `Spec section not saved: ${messageOf(e)}`;
    }
    // A section on the job's fire list: marked fire / life safety, so it goes to the fire marshal (0106, the database
    // decides, never a file already marked or cleared).
    try {
      await suggestOfs([fileId]);
      return null;
    } catch (e) {
      return `Not checked for OFS: ${messageOf(e)}`;
    }
  };
}
