// The spec book's bar over its pages in the full-screen viewer (Jesse, Oct 5: "a dropdown box that you scroll through
// and look for the spec that you want, would have the title in it too ... way easier way to get to the pages"). One
// list of every section ("09 21 16  Gypsum Board Assemblies", following the page in view; picking one jumps to its
// first page), previous / next section, previous / next page and the page number box. A book the server has not read
// yet is read here, in the background, by someone who may add files to Specs, and its sections appear when done.
import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, type LucideIcon } from 'lucide-react';
import { messageOf } from '../../data/errors';
import { specBooksQuery, useSaveSpecPages, type SpecBook } from '../../data/specs';
import type { PageNav } from '../../ui/FileViewer';
import { Icon } from '../../ui/Icon';
import { useToast } from '../../ui/Toast';
import { sectionAt } from './sections';

/** Pages read and sent per call (the server takes at most 50). */
const CHUNK = 25;

const BTN =
  'flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-white/90 hover:bg-white/15 focus-visible:outline focus-visible:outline-2 focus-visible:outline-white disabled:opacity-35';

function NavButton({ icon, label, testId, onClick }: { icon: LucideIcon; label: string; testId: string; onClick: (() => void) | undefined }) {
  return (
    <button type="button" className={BTN} aria-label={label} title={label} data-testid={testId} disabled={!onClick} onClick={onClick}>
      <Icon icon={icon} size={20} />
    </button>
  );
}

/** Reads the book's text page by page and sends it, while the bar is open. Answers "12 of 700" while it runs. */
function useSendText(projectId: string, book: SpecBook, nav: PageNav): string | null {
  const save = useSaveSpecPages(projectId);
  const toast = useToast();
  const [done, setDone] = useState<number | null>(null);
  const live = useRef({ nav, save, toast });
  useEffect(() => {
    live.current = { nav, save, toast };
  });
  const need = book.can_send && !book.text_ready;
  const pages = nav.pages;

  useEffect(() => {
    if (!need) return undefined;
    let stopped = false;
    const run = async () => {
      for (let from = 1; from <= pages && !stopped; from += CHUNK) {
        const chunk: { page: number; text: string }[] = [];
        for (let n = from; n < from + CHUNK && n <= pages; n += 1) chunk.push({ page: n, text: await live.current.nav.text(n) });
        if (stopped) return;
        await live.current.save.mutateAsync({ fileId: book.file_id, pageCount: pages, pages: chunk });
        setDone(Math.min(from + CHUNK - 1, pages));
      }
    };
    run().catch((e: unknown) => {
      if (!stopped) live.current.toast.show({ message: messageOf(e), tone: 'error' });
    });
    return () => {
      stopped = true;
    };
  }, [need, pages, book.file_id]);

  if (!need) return null;
  return `Finding sections ${String(done ?? 0)} of ${String(pages)}`;
}

function PageBox({ page, pages, goTo }: { page: number; pages: number; goTo: (n: number) => void }) {
  const jump = (raw: string) => {
    const n = Number(raw.trim());
    if (Number.isInteger(n) && n >= 1 && n !== page) goTo(Math.min(n, pages));
  };
  return (
    <label className="flex items-center gap-1.5 text-sm tabular-nums text-white/80">
      <span className="sr-only">Page</span>
      <input
        key={page}
        defaultValue={String(page)}
        inputMode="numeric"
        maxLength={5}
        data-testid="spec-page"
        className="h-10 w-16 rounded-lg bg-white/10 text-center text-[15px] font-semibold text-white outline-none focus:bg-white/20"
        onKeyDown={(e) => {
          if (e.key === 'Enter') jump(e.currentTarget.value);
        }}
        onBlur={(e) => {
          jump(e.currentTarget.value);
        }}
      />
      <span>/ {pages}</span>
    </label>
  );
}

interface SpecBarProps {
  projectId: string;
  /** The book as it was when opened; the live answer replaces it (its sections appear once found). */
  book: SpecBook;
  nav: PageNav;
}

export function SpecBar({ projectId, book: opened, nav }: SpecBarProps) {
  const books = useQuery(specBooksQuery(projectId));
  const book = books.data?.find((b) => b.file_id === opened.file_id) ?? opened;
  const sending = useSendText(projectId, book, nav);
  const { page, pages, goTo } = nav;
  const sections = book.sections;
  const at = sectionAt(sections, page);
  const prevSection = at >= 1 ? sections[at - 1] : undefined;
  const nextSection = sections[at + 1];
  const status = sending ?? (book.text_ready ? 'No sections found' : 'Sections not found yet');

  return (
    <div data-testid="spec-bar" className="flex shrink-0 flex-wrap items-center gap-x-2 gap-y-1.5 border-b border-white/10 px-2 py-2 text-white sm:px-4">
      {sections.length > 0 ? (
        <select
          aria-label="Section"
          data-testid="spec-section"
          value={String(at)}
          className="h-10 min-w-0 flex-1 basis-full rounded-lg bg-white/10 px-3 text-[15px] font-semibold text-white outline-none focus:bg-white/20 sm:basis-0"
          onChange={(e) => {
            const s = sections[Number(e.target.value)];
            if (s) goTo(s.first_page);
          }}
        >
          {at < 0 ? (
            <option value="-1" className="bg-card text-ink">
              Sections
            </option>
          ) : null}
          {sections.map((s, i) => (
            <option key={`${s.section}-${String(s.first_page)}`} value={String(i)} className="bg-card text-ink">
              {`${s.section}  ${s.title}`}
            </option>
          ))}
        </select>
      ) : (
        <p data-testid="spec-status" className="min-w-0 flex-1 basis-full text-sm font-medium text-white/80 sm:basis-0">
          {status}
        </p>
      )}
      <div className="flex items-center gap-0.5">
        <NavButton icon={ChevronsLeft} label="Previous section" testId="spec-prev-section" onClick={prevSection ? () => { goTo(prevSection.first_page); } : undefined} />
        <NavButton icon={ChevronLeft} label="Previous page" testId="spec-prev-page" onClick={page > 1 ? () => { goTo(page - 1); } : undefined} />
        <PageBox page={page} pages={pages} goTo={goTo} />
        <NavButton icon={ChevronRight} label="Next page" testId="spec-next-page" onClick={page < pages ? () => { goTo(page + 1); } : undefined} />
        <NavButton icon={ChevronsRight} label="Next section" testId="spec-next-section" onClick={nextSection ? () => { goTo(nextSection.first_page); } : undefined} />
      </div>
    </div>
  );
}
