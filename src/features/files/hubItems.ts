// A spec section as the hub (Jesse, Oct 12: "click a spec section and say show me all the RFIs and submittals
// associated with this"), under the section's text in the spec reader (0118). The sections: the job's spec book's, and any
// other a submittal, RFI or CCD names (titled from the CSI list when it has them). A section's items: the Submittals,
// RFIs (the RFI tool's whose Reference or title names it, and RFI documents filed under it) and CCDs filed under it, by
// its 6 digits, each group newest first. A file is filed under its spec section (0105, found on upload, Jesse, Oct 12:
// "hidden if we had to"), else its name's (fileSectionKey).
import type { RfiRef } from '../../data/specHub';
import type { FileRow } from '../../data/types';
import { fileSectionKey, sectionKey, sectionRefs } from '../specs/sections';

export interface HubSection {
  /** "092900". */
  key: string;
  /** "09 29 00". */
  section: string;
  /** "Gypsum Board"; empty when not known. */
  title: string;
  /** The spec book has it. */
  inBook: boolean;
}

interface Titled {
  section: string;
  title: string;
}

const spaced = (key: string) => `${key.slice(0, 2)} ${key.slice(2, 4)} ${key.slice(4, 6)}`;

/**
 * Every section to offer, by number: the book's (first title wins), then those only the items name, titled from the
 * CSI list. A Level 4 section ("09 21 16.13") is filed under its 6 digits.
 */
export function hubSections(book: readonly Titled[], named: readonly string[], csi: readonly Titled[] = []): HubSection[] {
  const out = new Map<string, HubSection>();
  for (const s of book) {
    const key = sectionKey(s.section);
    if (key !== null && !out.has(key)) out.set(key, { key, section: spaced(key), title: s.title, inBook: true });
  }
  for (const n of named) {
    const key = sectionKey(n);
    if (key === null || out.has(key)) continue;
    const title = csi.find((c) => sectionKey(c.section) === key)?.title ?? '';
    out.set(key, { key, section: spaced(key), title, inBook: false });
  }
  return [...out.values()].sort((a, b) => a.key.localeCompare(b.key));
}

/** The 6 digits of every section an RFI names in its Reference line or title. */
function rfiKeys(r: Pick<RfiRef, 'refs' | 'title'>): string[] {
  return sectionRefs(`${r.refs} ${r.title}`).flatMap((p) => {
    const key = 'section' in p ? sectionKey(p.section) : null;
    return key === null ? [] : [key];
  });
}

export interface HubSources {
  submittals: readonly FileRow[];
  /** RFI documents in Files' RFIs section. */
  rfiFiles: readonly FileRow[];
  ccds: readonly FileRow[];
  rfis: readonly RfiRef[];
}

/** Every section the items name ("09 29 00"), for sections the book doesn't have. */
export function namedSections(src: HubSources): string[] {
  const keys = [
    ...[...src.submittals, ...src.rfiFiles, ...src.ccds].flatMap((f) => fileSectionKey(f) ?? []),
    ...src.rfis.flatMap(rfiKeys),
  ];
  return [...new Set(keys)].map(spaced);
}

export type HubRfiRow = { kind: 'rfi'; rfi: RfiRef } | { kind: 'file'; file: FileRow };

interface HubGroups {
  submittals: FileRow[];
  rfis: HubRfiRow[];
  ccds: FileRow[];
}

const newest = (a: { created_at: string }, b: { created_at: string }) => b.created_at.localeCompare(a.created_at);
const at = (r: HubRfiRow) => (r.kind === 'rfi' ? r.rfi.created_at : r.file.created_at);

/** One section's items, each group newest first. */
export function hubGroups(key: string, src: HubSources): HubGroups {
  const mine = (files: readonly FileRow[]) => files.filter((f) => fileSectionKey(f) === key).sort(newest);
  const rfis: HubRfiRow[] = [
    ...src.rfis.filter((r) => rfiKeys(r).includes(key)).map((rfi) => ({ kind: 'rfi' as const, rfi })),
    ...mine(src.rfiFiles).map((file) => ({ kind: 'file' as const, file })),
  ].sort((a, b) => at(b).localeCompare(at(a)));
  return { submittals: mine(src.submittals), rfis, ccds: mine(src.ccds) };
}
