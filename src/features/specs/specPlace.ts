// Where the spec reader is (0118), all in the URL so Back, links and a reload land in the same place (router only):
// Files in Specs, the volume open in the book (?vol=, its file), the section (?at=, its first page in that volume,
// and ?spec=, its 6 digits, which the submittals and RFIs under it are filed by), and the PDF pages in place of the
// text (?pages=, the page they show from).
import { useNavigate, useSearch } from '@tanstack/react-router';
import type { SpecBook, SpecBookSection } from '../../data/specs';
import { findSection, sectionKey } from './sections';

export interface SpecPlace {
  vol: string | null;
  at: number | null;
  spec: string | null;
  pages: number | null;
}

interface PlaceSearch {
  folder?: string | undefined;
  vol?: string | undefined;
  at?: number | undefined;
  spec?: string | undefined;
  pages?: number | undefined;
}

/** Where the reader is now. */
export function useSpecPlace(): SpecPlace {
  const s: PlaceSearch = useSearch({ strict: false });
  return { vol: s.vol ?? null, at: s.at ?? null, spec: s.spec ?? null, pages: s.pages ?? null };
}

/** Reading a section or pages (else Specs shows its book and files). */
export const isReading = (p: SpecPlace) => p.spec !== null || p.pages !== null || p.at !== null;

/** The search for a place, only the parts set (exactOptionalPropertyTypes). */
interface PlaceParams {
  folder?: string;
  vol?: string;
  at?: number;
  spec?: string;
  pages?: number;
}

export function placeSearch(folder: string | undefined, p: Partial<SpecPlace>): PlaceParams {
  return {
    ...(folder ? { folder } : {}),
    ...(p.vol ? { vol: p.vol } : {}),
    ...(p.at != null ? { at: p.at } : {}),
    ...(p.spec ? { spec: p.spec } : {}),
    ...(p.pages != null ? { pages: p.pages } : {}),
  };
}

/** A section's own place: its volume, first page and 6 digits. */
export function sectionPlace(book: Pick<SpecBook, 'file_id'>, s: Pick<SpecBookSection, 'section' | 'first_page'>): Partial<SpecPlace> {
  return { vol: book.file_id, at: s.first_page, spec: sectionKey(s.section) };
}

interface Opened {
  book: SpecBook;
  section: SpecBookSection;
}

/** The section the place means: its volume's section at that first page, else the newest volume with that number. */
export function openedSection(books: readonly SpecBook[], p: SpecPlace): Opened | null {
  const vol = p.vol === null ? undefined : books.find((b) => b.file_id === p.vol);
  if (vol && p.at !== null) {
    const exact = vol.sections.find((s) => s.first_page === p.at);
    if (exact) return { book: vol, section: exact };
  }
  if (p.spec === null) return null;
  if (vol) {
    const inVol = findSection(vol.sections, p.spec);
    if (inVol) return { book: vol, section: inVol };
  }
  for (const book of [...books].reverse()) {
    const s = findSection(book.sections, p.spec);
    if (s) return { book, section: s };
  }
  return null;
}

/** Moves the reader (Files, its Specs folder). */
export function useSpecNav(projectId: string, specsFolder: string | undefined) {
  const navigate = useNavigate();
  const go = (p: Partial<SpecPlace>, replace = false) => {
    void navigate({ to: '/p/$projectId/$tool', params: { projectId, tool: 'files' }, search: placeSearch(specsFolder, p), replace });
  };
  return {
    go,
    section: (book: Pick<SpecBook, 'file_id'>, s: Pick<SpecBookSection, 'section' | 'first_page'>) => {
      go(sectionPlace(book, s));
    },
    volume: (fileId: string | null) => {
      go(fileId === null ? {} : { vol: fileId }, true);
    },
  };
}
