// The spec book (0118, Jesse, Oct 23: "Use the right side ... Click Volume 1 and the right side expands into the
// sections, click a section and the main page changes to it"): in the right column beside Files > Specs, and the first
// screen of Specs on a phone. A search box on top (a number however it is spaced, or words of a title). Volumes as rows
// only when the job has more than one; the picked one shows its divisions with their sections. One level, no windows.
import { useState } from 'react';
import { BookOpen, ChevronDown, ChevronRight, Search } from 'lucide-react';
import { useCsiLibrary } from '../../data/csi.queries';
import { useFileSections } from '../../data/fileSections';
import { useSpecBooks, type SpecBook } from '../../data/specs';
import { FOCUS_RING } from '../../ui/box';
import { Icon } from '../../ui/Icon';
import { EmptyState, ErrorState, LoadingState } from '../../ui/States';
import { BookSections } from './BookSections';
import { findSections } from './findSections';
import { openedSection, useSpecNav, useSpecPlace } from './specPlace';

const volumeName = (b: SpecBook) => b.file_name.replace(/\.pdf$/i, '');

interface VolumeRowProps {
  book: SpecBook;
  open: boolean;
  count: number;
  onPick: () => void;
}

function VolumeRow({ book, open, count, onPick }: VolumeRowProps) {
  return (
    <button
      type="button"
      data-testid="spec-volume"
      aria-expanded={open}
      className={`flex w-full items-center gap-3 border-b-[1.5px] border-ink px-4 py-3 text-left ${FOCUS_RING} focus-visible:-outline-offset-4 ${open ? 'bg-ink text-white' : 'bg-card text-ink hover:bg-card-head'}`}
      onClick={onPick}
    >
      <Icon icon={open ? ChevronDown : ChevronRight} size={18} className="shrink-0" />
      <span className="heading min-w-0 flex-1 text-[16px] font-semibold wrap-anywhere">{volumeName(book)}</span>
      <span className={`shrink-0 text-[13px] tabular-nums ${open ? 'text-white/80' : 'text-ink-2'}`}>{count}</span>
    </button>
  );
}

/** A volume with no sections: still being read, or none found (its pages still open). */
function NoSections({ book, onPages }: { book: SpecBook; onPages: () => void }) {
  return (
    <div className="flex flex-col items-start gap-2 px-4 py-4 text-sm text-ink-2">
      <p>{book.text_ready ? 'No sections found.' : 'Reading the book.'}</p>
      <button type="button" data-testid="spec-volume-pages" className="font-semibold text-accent underline underline-offset-2" onClick={onPages}>
        Open the pages
      </button>
    </div>
  );
}

export function SpecBookPanel({ projectId }: { projectId: string }) {
  const books = useSpecBooks(projectId);
  const csi = useCsiLibrary();
  const files = useFileSections(projectId);
  const place = useSpecPlace();
  const nav = useSpecNav(projectId, files.data?.find((s) => s.kind === 'specs')?.folder_id);
  const [query, setQuery] = useState('');

  if (books.isPending) return <LoadingState label="Loading the spec book" />;
  if (books.isError) return <ErrorState error={books.error} onRetry={() => void books.refetch()} />;
  const list = books.data;
  if (list.length === 0) return <EmptyState icon={BookOpen} title="No spec book in Specs yet." />;

  const opened = openedSection(list, place);
  const searching = query.trim() !== '';
  const divisionTitle = (d: string) => csi.data?.divisions.find((x) => x.number === d)?.title ?? null;
  const many = list.length > 1;
  // The volume in view: the URL's, else the open section's, else the only one.
  const openVol = place.vol ?? opened?.book.file_id ?? (many ? null : (list[0]?.file_id ?? null));
  const found = list.map((b) => ({ book: b, groups: findSections(b.sections, query, divisionTitle).groups }));
  const hits = found.filter((f) => f.groups.length > 0);

  return (
    <div data-testid="spec-book" className="flex flex-col">
      <div className="sticky top-0 z-10 border-b-2 border-ink bg-card p-3">
        <label className={`flex h-11 items-center gap-2 rounded-md border-[1.5px] border-ink bg-card px-3 shadow-control focus-within:outline focus-within:outline-[3px] focus-within:outline-offset-1 focus-within:outline-accent`}>
          <Icon icon={Search} size={18} className="shrink-0 text-ink-2" />
          <input
            type="search"
            aria-label="Find a spec section"
            placeholder="Section number or title"
            data-testid="spec-find"
            enterKeyHint="go"
            value={query}
            className="min-w-0 flex-1 bg-transparent text-[15px] text-ink outline-none placeholder:text-ink-3/60"
            onChange={(e) => {
              setQuery(e.target.value);
            }}
            onKeyDown={(e) => {
              if (e.key !== 'Enter') return;
              const first = list.map((b) => ({ b, s: findSections(b.sections, query, divisionTitle).first })).find((x) => x.s !== null);
              if (first?.s) nav.section(first.b, first.s);
            }}
          />
        </label>
      </div>
      {searching ? (
        hits.length === 0 ? (
          <p className="px-4 py-6 text-sm text-ink-2">No section matches.</p>
        ) : (
          hits.map(({ book, groups }) => (
            <div key={book.file_id}>
              {many ? <p className="heading border-b-[1.5px] border-ink bg-card-head px-4 py-2 text-[14px] font-semibold text-ink">{volumeName(book)}</p> : null}
              <BookSections groups={groups} at={opened?.book.file_id === book.file_id ? opened.section.first_page : null} onPick={(s) => { nav.section(book, s); }} />
            </div>
          ))
        )
      ) : (
        found.map(({ book, groups }) => {
          const open = book.file_id === openVol;
          return (
            <div key={book.file_id}>
              {many ? <VolumeRow book={book} open={open} count={book.sections.length} onPick={() => { nav.volume(open ? null : book.file_id); }} /> : null}
              {open && groups.length === 0 ? <NoSections book={book} onPages={() => { nav.go({ vol: book.file_id, pages: 1 }); }} /> : null}
              {open ? (
                <BookSections groups={groups} at={opened?.book.file_id === book.file_id ? opened.section.first_page : null} onPick={(s) => { nav.section(book, s); }} />
              ) : null}
            </div>
          );
        })
      )}
    </div>
  );
}
