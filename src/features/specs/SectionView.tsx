// One spec section in the main column (0118): its number and title big, its text rebuilt (SectionBody), what is filed
// under it (the hub), and Previous / Next section. "Show the PDF pages" puts its pages in this same column. A section
// the server has not read yet, or a scan with no text layer, keeps the pages only (no OCR).
import { useEffect, useRef, type ReactNode } from 'react';
import { ArrowLeft, ArrowRight, FileText } from 'lucide-react';
import { useSectionText, type SpecBook, type SpecBookSection } from '../../data/specs';
import { CLICK_BOX } from '../../ui/box';
import { Button } from '../../ui/Button';
import { Icon } from '../../ui/Icon';
import { ErrorState, LoadingState } from '../../ui/States';
import { SectionBody } from './SectionBody';

export interface Neighbor {
  book: SpecBook;
  section: SpecBookSection;
}

interface SectionViewProps {
  book: SpecBook;
  section: SpecBookSection;
  /** More than one volume: the volume's name shows. */
  manyVolumes: boolean;
  prev: Neighbor | null;
  next: Neighbor | null;
  onPages: () => void;
  onGo: (to: Neighbor) => void;
  /** What is filed under it. */
  related: ReactNode;
}

const pagesOf = (s: SpecBookSection) => (s.first_page === s.last_page ? `Page ${String(s.first_page)}` : `Pages ${String(s.first_page)} to ${String(s.last_page)}`);

function TextPart({ book, section }: { book: SpecBook; section: SpecBookSection }) {
  const text = useSectionText(book.file_id, section.first_page);
  if (text.isPending) return <LoadingState label="Loading the section" />;
  if (text.isError) return <ErrorState error={text.error} onRetry={() => void text.refetch()} className="m-0" />;
  const t = text.data;
  if (t === null) return <p className="text-[15px] text-ink-2">This section is not in the spec book now.</p>;
  if (t.status === 'waiting') return <p data-testid="spec-text-waiting" className="text-[15px] text-ink-2">The text is being read. The PDF pages are ready.</p>;
  if (t.status === 'no_text' || t.body.length === 0) {
    return <p data-testid="spec-text-none" className="text-[15px] text-ink-2">These pages have no text to show (a scan). Open the PDF pages.</p>;
  }
  return <SectionBody blocks={t.body} />;
}

function StepButton({ to, dir, onGo }: { to: Neighbor | null; dir: 'prev' | 'next'; onGo: (to: Neighbor) => void }) {
  if (!to) return <span className="hidden flex-1 sm:block" />;
  const next = dir === 'next';
  return (
    <button
      type="button"
      data-testid={next ? 'spec-next-section' : 'spec-prev-section'}
      className={`flex min-h-16 flex-1 items-center gap-3 rounded-card px-4 py-3 ${next ? 'flex-row-reverse text-right' : 'text-left'} ${CLICK_BOX}`}
      onClick={() => {
        onGo(to);
      }}
    >
      <Icon icon={next ? ArrowRight : ArrowLeft} size={20} className="shrink-0 text-ink" />
      <span className="min-w-0 flex-1">
        <span className="heading block text-[13px] font-semibold text-ink-2">{next ? 'Next section' : 'Previous section'}</span>
        <span className="block text-[15px] text-ink wrap-anywhere">
          <span className="mr-2 font-semibold tabular-nums">{to.section.section}</span>
          {to.section.title}
        </span>
      </span>
    </button>
  );
}

export function SectionView({ book, section, manyVolumes, prev, next, onPages, onGo, related }: SectionViewProps) {
  // A section opens at its top (Next from the bottom of the last one included).
  const top = useRef<HTMLDivElement>(null);
  useEffect(() => {
    top.current?.scrollIntoView({ block: 'start' });
  }, []);
  return (
    <div ref={top} data-testid="spec-section" className="flex scroll-mt-4 flex-col gap-5">
      <article className="rounded-card bg-card px-4 py-5 shadow-card sm:px-8 sm:py-7">
        <header className="mb-6 border-b-[3px] border-ink pb-4">
          <p data-testid="spec-section-number" className="heading text-[40px] font-semibold leading-none tabular-nums text-ink sm:text-[52px]">
            {section.section}
          </p>
          <h1 data-testid="spec-section-title" className="heading mt-2 text-[21px] font-semibold leading-tight text-ink-2 wrap-anywhere sm:text-[25px]">
            {section.title}
          </h1>
          <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2">
            <Button icon={FileText} variant="secondary" data-testid="spec-show-pages" onClick={onPages}>
              Show the PDF pages
            </Button>
            <span data-testid="spec-section-where" className="text-sm text-ink-2">
              {manyVolumes ? `${book.file_name.replace(/\.pdf$/i, '')}, ${pagesOf(section).toLowerCase()}` : pagesOf(section)}
            </span>
          </div>
        </header>
        <TextPart book={book} section={section} />
      </article>
      {related}
      <nav aria-label="Sections" className="flex flex-col gap-3 sm:flex-row">
        <StepButton to={prev} dir="prev" onGo={onGo} />
        <StepButton to={next} dir="next" onGo={onGo} />
      </nav>
    </div>
  );
}
