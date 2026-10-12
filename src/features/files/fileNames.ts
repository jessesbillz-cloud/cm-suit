// What a file's name says, for the columns of a section in Files (Jesse, Oct 11). Plans: the sheet number at the start
// of the name ("A201A Floor Plan Level 01 Area A.pdf": A201A, "Floor Plan Level 01 Area A"). Submittals, both ways they
// are named: "092900_04.0_Gypsum Board_PD_Acoustic Sealant_NET.pdf" (section 09 29 00, No. 04.0, stamp NET) and the older
// "S-0147.0-079200-Joint Sealants- PD - XYZ - AAN.pdf" (No. 0147.0, section 07 92 00, stamp AAN). The company is the end
// of the trade folder's name ("092000 - Framing - Sample Co": Sample Co). A name that says none of it shows as it is.
// Type codes (PD, SD) stay in the title: dropping them would lose what the submittal is.

/** The name without its extension. */
export function stripExt(name: string): string {
  return name.replace(/\.(?=[A-Za-z0-9]*[A-Za-z])[A-Za-z0-9]{1,5}$/, '');
}

/** Underscores become spaces, separators at either end go, runs of spaces become one. */
function tidy(s: string): string {
  return s
    .replace(/_/g, ' ')
    .replace(/^[\s.-]+|[\s.-]+$/g, '')
    .replace(/\s+/g, ' ');
}

const SHEET = /^[A-Z]{1,2}-?\d{3}(?:[A-Z]|\.\d+)?(?=[\s_.-]|$)/i;

export interface Sheet {
  sheet: string;
  title: string;
}

/** The sheet number at the start of the name (1 or 2 letters, an optional dash, 3 digits, an optional letter or .n). */
export function parseSheet(name: string): Sheet | null {
  const base = stripExt(name);
  const m = SHEET.exec(base);
  if (!m) return null;
  return { sheet: m[0].toUpperCase(), title: tidy(base.slice(m[0].length)) };
}

/** Sheets by number (A101 before A201 before A201A), names without one after them. */
export function bySheet(a: string, b: string): number {
  const sa = parseSheet(a)?.sheet.replace('-', '');
  const sb = parseSheet(b)?.sheet.replace('-', '');
  if (sa !== undefined && sb !== undefined && sa !== sb) return sa.localeCompare(sb, 'en', { numeric: true });
  if (sa !== undefined && sb === undefined) return -1;
  if (sa === undefined && sb !== undefined) return 1;
  return a.localeCompare(b, 'en', { numeric: true });
}

/** The review stamps a submittal's name ends with. */
const STAMPS = new Set(['NET', 'A', 'AAN', 'AN', 'MCN', 'RNR', 'R&R', 'RR', 'REJ']);

export interface Submittal {
  /** "09 29 00". */
  section: string;
  /** "04.0", "0147.0"; null when the name has none. */
  no: string | null;
  title: string;
  /** "NET", "MCN RNR"; null when the name ends with none. */
  stamp: string | null;
}

/** "092900" as "09 29 00". */
function formatSection(six: string): string {
  return `${six.slice(0, 2)} ${six.slice(2, 4)} ${six.slice(4, 6)}`;
}

/** The last part, when every word of it is a stamp code, comes off as the stamp. */
function splitStamp(parts: string[]): { parts: string[]; stamp: string | null } {
  const last = parts[parts.length - 1];
  const words = last?.trim().split(/\s+/) ?? [];
  if (parts.length < 2 || words.length === 0 || !words.every((w) => STAMPS.has(w.toUpperCase()))) return { parts, stamp: null };
  return { parts: parts.slice(0, -1), stamp: words.map((w) => w.toUpperCase()).join(' ') };
}

const NEW_FORM = /^(\d{6})_(\d{1,4}(?:\.\d{1,2})?)_(.+)$/;
const OLD_FORM = /^S-(\d{3,5}(?:\.\d{1,2})?)-(\d{6})-(.+)$/i;
const SECTION_ONLY = /^(\d{6})(?:[\s_.-]+(.*))?$/;

export function parseSubmittal(name: string): Submittal | null {
  const base = stripExt(name);
  const fresh = NEW_FORM.exec(base);
  if (fresh?.[1] !== undefined && fresh[2] !== undefined && fresh[3] !== undefined) {
    const { parts, stamp } = splitStamp(fresh[3].split('_'));
    return { section: formatSection(fresh[1]), no: fresh[2], title: tidy(parts.join(' ')), stamp };
  }
  const old = OLD_FORM.exec(base);
  if (old?.[1] !== undefined && old[2] !== undefined && old[3] !== undefined) {
    const { parts, stamp } = splitStamp(old[3].split(/\s*-\s+|\s+-\s*/).filter((p) => p.trim() !== ''));
    return { section: formatSection(old[2]), no: old[1], title: tidy(parts.join(' ')), stamp };
  }
  const bare = SECTION_ONLY.exec(base);
  if (bare?.[1] !== undefined) {
    const { parts, stamp } = splitStamp((bare[2] ?? '').split(/_|\s+-\s+/).filter((p) => p.trim() !== ''));
    return { section: formatSection(bare[1]), no: null, title: tidy(parts.join(' ')), stamp };
  }
  return null;
}

/** Submittals by section, then number; names that aren't one after them. */
export function bySubmittal(a: string, b: string): number {
  const sa = parseSubmittal(a);
  const sb = parseSubmittal(b);
  if (sa && sb) {
    return (
      sa.section.localeCompare(sb.section) ||
      (sa.no ?? '').localeCompare(sb.no ?? '', 'en', { numeric: true }) ||
      a.localeCompare(b, 'en', { numeric: true })
    );
  }
  if (sa) return -1;
  if (sb) return 1;
  return a.localeCompare(b, 'en', { numeric: true });
}

/** The company of a trade folder: what follows its last " - ". */
export function companyOf(folderName: string): string {
  const at = folderName.lastIndexOf(' - ');
  return (at >= 0 ? folderName.slice(at + 3) : folderName).trim();
}
