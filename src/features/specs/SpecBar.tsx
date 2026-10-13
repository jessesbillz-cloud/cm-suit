// The spec book's bar over its pages in the full-screen viewer: previous / next section, previous / next page and the
// page number box. The sections themselves are found and picked in the panel left of the pages (SpecSide), on a phone in
// a sheet opened from the bar, which names the section in view (Jesse, Oct 12: the search box and boxes replace the
// Oct 5 dropdown). A book the server has not read yet is read here, in the background, by someone who may add files to
// Specs, and its sections appear when done.
import { useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, Search, type LucideIcon } from 'lucide-react';
import { messageOf } from '../../data/errors';
import { useSaveSpecPages, type SpecBook } from '../../data/specs';
import type { PageNav } from '../../ui/FileViewer';
import { Icon } from '../../ui/Icon';
import { useToast } from '../../ui/Toast';
import { sectionAt } from './sections';
import { SpecSheet } from './SpecSheet';
import { useLiveBook } from './useLiveBook';

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
    // Asked as a call: the loop awaits, and the cleanup below may stop it in between.
    const isStopped = () => stopped;
    const run = async () => {
      for (let from = 1; from <= pages && !isStopped(); from += CHUNK) {
        const chunk: { page: number; text: string }[] = [];
        for (let n = from; n < from + CHUNK && n <= pages; n += 1) chunk.push({ page: n, text: await live.current.nav.text(n) });
        if (isStopped()) return;
        await live.current.save.mutateAsync({ fileId: book.file_id, pageCount: pages, pages: chunk });
        setDone(Math.min(from + CHUNK - 1, pages));
      }
    };
    run().catch((e: unknown) => {
      if (!isStopped()) live.current.toast.show({ message: messageOf(e), tone: 'error' });
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
  /** A section's page in Files. */
  onHub: (section: string) => void;
}

export function SpecBar({ projectId, book: opened, nav, onHub }: SpecBarProps) {
  const book = useLiveBook(projectId, opened);
  const sending = useSendText(projectId, book, nav);
  const [sheet, setSheet] = useState(false);
  const { page, pages, goTo } = nav;
  const sections = book.sections;
  const at = sectionAt(sections, page);
  const current = sections[at];
  const prevSection = at >= 1 ? sections[at - 1] : undefined;
  const nextSection = sections[at + 1];
  const status = sending ?? (book.text_ready ? 'No sections found' : 'Sections not found yet');

  return (
    <div data-testid="spec-bar" className="flex shrink-0 flex-wrap items-center gap-x-2 gap-y-1.5 border-b border-white/10 px-2 py-2 text-white md:px-4">
      {sections.length > 0 ? (
        <>
          <button
            type="button"
            data-testid="spec-sections-open"
            aria-haspopup="dialog"
            className="flex min-h-10 min-w-0 flex-1 basis-full items-center gap-2 rounded-lg bg-white/10 px-3 py-1.5 text-left text-[15px] font-semibold hover:bg-white/15 md:hidden"
            onClick={() => {
              setSheet(true);
            }}
          >
            <Icon icon={Search} size={18} className="shrink-0 text-white/80" />
            <span className="min-w-0 flex-1 wrap-anywhere">
              {current ? (
                <>
                  <span className="mr-2 tabular-nums">{current.section}</span>
                  {current.title}
                </>
              ) : (
                'Sections'
              )}
            </span>
          </button>
          <span aria-hidden className="hidden flex-1 md:block" />
        </>
      ) : (
        <p data-testid="spec-status" className="min-w-0 flex-1 basis-full text-sm font-medium text-white/80 md:basis-0">
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
      {sheet ? (
        <SpecSheet
          sections={sections}
          at={at}
          onPick={goTo}
          onHub={onHub}
          onClose={() => {
            setSheet(false);
          }}
        />
      ) : null}
    </div>
  );
}
