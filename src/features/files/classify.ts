// Where an upload goes, by its name, never by a question (Jesse, Oct 11: no more "dumping ground"). A dropped folder's
// own name says it first ("Approved Submittals", "Specs"), then the file's name: OFS_IR... is an OFS IR (Reports), a
// submittal's own number or S-0147.0-079200 is a submittal, then the word RFI (Jesse, Oct 12), a spec section at the
// start (a submittal), the word CCD, a picture is a photo, a sheet number at the start is a plan. Anything else goes where the person is looking. A dropped folder stays together and goes where
// most of its files point. CCDs are a DSA form: on a job without them (Jesse, Oct 23: "No CCDs on a CSU job"), what
// names a CCD goes to To sort.
import { parseSheet, stripExt } from './fileNames';

/** The sections of Files, in their order (0097 files_sections). */
export const SECTION_KINDS = ['plans', 'specs', 'submittals', 'rfis', 'ccd', 'reports', 'photos', 'unsorted', 'bids_received', 'inbound'] as const;
export type SectionKind = (typeof SECTION_KINDS)[number];

const IMAGE = /\.(jpe?g|png|heic|heif)$/i;
const OFS_IR = /^OFS_IR/i;
const S_FORM = /^S-\d{3,5}(?:\.\d{1,2})?-\d{6}(?=[\s_.-]|$)/i;
const SPEC_START = /^\d{6}(?=[\s_.-]|$)/;
/** A submittal's own number after the section ("092900_04.0_..."): a submittal even while Specs is open. */
const SUBMITTAL_NO = /^\d{6}_\d{1,4}(?:\.\d{1,2})?_/;
const word = (w: string) => new RegExp(`(^|[^a-z])(${w})([^a-z]|$)`, 'i');
const RFI = word('rfis?');
const CCD = word('ccds?');

/** A folder named for a section (outermost first wins). */
const FOLDER_WORDS: readonly [SectionKind, RegExp][] = [
  ['submittals', word('submittals?')],
  ['rfis', RFI],
  ['ccd', CCD],
  ['specs', word('specs?|specifications?')],
  ['plans', word('plans?|drawings?')],
  ['photos', word('photos?|pictures?')],
];

function byName(name: string): SectionKind | null {
  const base = stripExt(name);
  if (OFS_IR.test(base)) return 'reports';
  if (S_FORM.test(base) || SUBMITTAL_NO.test(name)) return 'submittals';
  if (RFI.test(base)) return 'rfis';
  if (SPEC_START.test(base)) return 'submittals';
  if (CCD.test(base)) return 'ccd';
  if (IMAGE.test(name)) return 'photos';
  if (parseSheet(name)) return 'plans';
  return null;
}

function byFolderWord(dir: readonly string[]): SectionKind | null {
  for (const d of dir) {
    const hit = FOLDER_WORDS.find(([, re]) => re.test(d));
    if (hit) return hit[0];
  }
  return null;
}

/**
 * The section an upload belongs in, or null for "where the person is looking". `dir` is the dropped folders the file
 * sat in, outermost first. A spec section dropped while Specs is open stays a spec (a submittal names its number too).
 * `ccds`: the job has CCDs (a DSA job, hasCcds).
 */
export function classifyUpload(name: string, dir: readonly string[], viewing: SectionKind | undefined, ccds: boolean): SectionKind | null {
  const found = byFolderWord(dir) ?? byName(name) ?? dir.map((d) => byName(d)).find((k) => k !== null) ?? null;
  if (found === 'ccd' && !ccds) return 'unsorted';
  if (found === 'submittals' && viewing === 'specs' && byFolderWord(dir) === null && !S_FORM.test(name) && !SUBMITTAL_NO.test(name)) {
    return 'specs';
  }
  return found;
}

/** Where most of them point (a tie goes to the earlier section); null when none points anywhere. */
export function mostOf(kinds: readonly (SectionKind | null)[]): SectionKind | null {
  let best: SectionKind | null = null;
  let most = 0;
  for (const k of SECTION_KINDS) {
    const n = kinds.filter((x) => x === k).length;
    if (n > most) {
      best = k;
      most = n;
    }
  }
  return best;
}

interface Dropped {
  file: { name: string };
  dir: string[];
}

interface SortedGroup<T extends Dropped> {
  /** Null: where the person is looking. */
  kind: SectionKind | null;
  /** A dropped folder (its files keep their folders), or loose files. */
  tree: boolean;
  /**
   * The dropped folder is named for the section it goes to ("Approved Submittals" into Submittals): what is in it goes
   * right into the section, so trade folders stay one level down.
   */
  intoSection: boolean;
  items: T[];
}

/** Loose files each go their own way; each dropped folder goes where most of its files point, as one. */
export function sortDrop<T extends Dropped>(dropped: readonly T[], viewing: SectionKind | undefined, ccds: boolean): SortedGroup<T>[] {
  const out: SortedGroup<T>[] = [];
  const loose = new Map<SectionKind | null, T[]>();
  const trees = new Map<string, T[]>();
  for (const d of dropped) {
    const top = d.dir[0];
    if (top === undefined) {
      const k = classifyUpload(d.file.name, [], viewing, ccds);
      loose.set(k, [...(loose.get(k) ?? []), d]);
    } else {
      trees.set(top, [...(trees.get(top) ?? []), d]);
    }
  }
  for (const [kind, items] of loose) out.push({ kind, tree: false, intoSection: false, items });
  for (const [top, items] of trees) {
    const kind = mostOf(items.map((d) => classifyUpload(d.file.name, d.dir, viewing, ccds)));
    out.push({ kind, tree: true, intoSection: kind !== null && byFolderWord([top]) === kind, items });
  }
  return out;
}
