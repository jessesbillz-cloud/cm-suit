// The spec book's sections left of its pages on a desktop (the phone opens the same list as a sheet from the bar).
// Nothing shows while the book has no sections.
import type { SpecBook } from '../../data/specs';
import type { PageNav } from '../../ui/FileViewer';
import { SectionFinder } from './SectionFinder';
import { sectionAt } from './sections';
import { useLiveBook } from './useLiveBook';

interface SpecSideProps {
  projectId: string;
  book: SpecBook;
  nav: PageNav;
  onHub: (section: string) => void;
}

export function SpecSide({ projectId, book: opened, nav, onHub }: SpecSideProps) {
  const book = useLiveBook(projectId, opened);
  if (book.sections.length === 0) return null;
  return (
    <aside data-testid="spec-side" aria-label="Sections" className="hidden w-80 shrink-0 flex-col border-r border-white/10 p-3 text-white md:flex">
      <SectionFinder sections={book.sections} at={sectionAt(book.sections, nav.page)} onPick={nav.goTo} onHub={onHub} />
    </aside>
  );
}
