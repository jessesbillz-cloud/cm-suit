// The spec reader's main column (0118): the section the URL names, as text (SectionView) or its PDF pages
// (SectionPages), or a volume's pages. A section number the book lacks shows what is filed under it. On a phone the
// book is the screen before this one: Back returns to it.
import { ArrowLeft } from 'lucide-react';
import type { FileSection } from '../../data/fileSections';
import { useSpecBooks } from '../../data/specs';
import { Button } from '../../ui/Button';
import { Card } from '../../ui/Card';
import { ErrorState, LoadingState } from '../../ui/States';
import { SpecHub } from '../files/SpecHub';
import { useHubData } from '../files/useHubData';
import { SectionPages } from './SectionPages';
import { SectionView, type Neighbor } from './SectionView';
import { sectionKey } from './sections';
import { openedSection, sectionPlace, useSpecNav, useSpecPlace } from './specPlace';

interface SpecReaderProps {
  projectId: string;
  sections: readonly FileSection[];
  timeZone: string | null;
  selectedFileId: string | null;
  isPhone: boolean;
  onOpenFile: (fileId: string) => void;
  onOpenRfi: (rfiId: string) => void;
}

const spaced = (key: string) => `${key.slice(0, 2)} ${key.slice(2, 4)} ${key.slice(4, 6)}`;

export function SpecReader({ projectId, sections, timeZone, selectedFileId, isPhone, onOpenFile, onOpenRfi }: SpecReaderProps) {
  const books = useSpecBooks(projectId);
  const hub = useHubData(projectId, sections);
  const place = useSpecPlace();
  const nav = useSpecNav(projectId, sections.find((s) => s.kind === 'specs')?.folder_id);
  const back = isPhone ? (
    <Button
      icon={ArrowLeft}
      variant="secondary"
      data-testid="spec-back"
      className="self-start"
      onClick={() => {
        nav.go(place.vol ? { vol: place.vol } : {});
      }}
    >
      Spec book
    </Button>
  ) : null;

  if (books.isPending) {
    return (
      <Card>
        <LoadingState label="Loading the spec book" />
      </Card>
    );
  }
  if (books.isError) return <ErrorState error={books.error} onRetry={() => void books.refetch()} className="m-0" />;

  const list = books.data;
  const opened = openedSection(list, place);
  const hubRows = { data: hub, timeZone, selectedFileId, onOpenFile, onOpenRfi };

  if (place.pages !== null) {
    const book = opened?.book ?? list.find((b) => b.file_id === place.vol);
    if (book) {
      const section = opened?.section ?? null;
      return (
        <div className="flex min-h-0 flex-1 flex-col gap-3">
          {back}
          <SectionPages
            book={book}
            section={section}
            page={place.pages}
            onText={section ? () => { nav.go(sectionPlace(book, section)); } : undefined}
          />
        </div>
      );
    }
  }

  if (!opened) {
    const key = place.spec;
    const known = key === null ? undefined : hub.sections.find((s) => s.key === key);
    return (
      <div className="flex flex-col gap-3">
        {back}
        {key === null ? (
          <Card>
            <p className="text-[15px] text-ink-2">That section is not in the spec book.</p>
          </Card>
        ) : (
          <SpecHub
            sectionKey={key}
            title={
              <span data-testid="spec-hub-title" className="wrap-anywhere">
                <span className="mr-2 tabular-nums">{known?.section ?? spaced(key)}</span>
                {known?.title ?? ''}
              </span>
            }
            {...hubRows}
          />
        )}
      </div>
    );
  }

  // Previous and next run through every volume, in book order.
  const all: Neighbor[] = list.flatMap((book) => book.sections.map((section) => ({ book, section })));
  const i = all.findIndex((n) => n.book.file_id === opened.book.file_id && n.section.first_page === opened.section.first_page);
  const key = sectionKey(opened.section.section) ?? '';
  return (
    <div className="flex flex-col gap-3">
      {back}
      <SectionView
        key={`${opened.book.file_id}:${String(opened.section.first_page)}`}
        book={opened.book}
        section={opened.section}
        manyVolumes={list.length > 1}
        prev={all[i - 1] ?? null}
        next={all[i + 1] ?? null}
        onPages={() => {
          nav.go({ ...sectionPlace(opened.book, opened.section), pages: opened.section.first_page });
        }}
        onGo={(to) => {
          nav.section(to.book, to.section);
        }}
        related={<SpecHub sectionKey={key} title={`Filed under ${opened.section.section}`} {...hubRows} />}
      />
    </div>
  );
}
