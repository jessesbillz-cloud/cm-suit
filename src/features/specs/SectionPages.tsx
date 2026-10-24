// A spec section's PDF pages in the main column, in place of its text (0118: "Show the PDF pages", one tap back to the
// text). Only the section's own pages; a volume with no section open shows all of its pages. Download is one click.
import { Download, FileText } from 'lucide-react';
import { downloadFile } from '../../data/download';
import { usePreviewFetch } from '../../data/preview';
import type { SpecBook, SpecBookSection } from '../../data/specs';
import { Button } from '../../ui/Button';
import { FilePreview, type ViewerItem } from '../../ui/FileViewer';
import { useDownload } from '../files/useDownload';

interface SectionPagesProps {
  book: SpecBook;
  section: SpecBookSection | null;
  /** The page they open at. */
  page: number;
  /** Back to the section's text; absent for a volume's pages. */
  onText?: (() => void) | undefined;
}

export function SectionPages({ book, section, page, onText }: SectionPagesProps) {
  const preview = usePreviewFetch();
  const download = useDownload();
  const item: ViewerItem = {
    id: `${book.file_id}:${String(section?.first_page ?? 0)}`,
    name: book.file_name,
    kind: 'pdf',
    url: () => preview(book.file_id),
    download: () => downloadFile(book.file_id, book.size),
    startPage: page,
    pageRange: section ? { first: section.first_page, last: section.last_page } : undefined,
  };
  return (
    <div data-testid="spec-pages" className="flex min-h-0 flex-1 flex-col gap-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <h1 className="heading min-w-0 flex-1 text-[20px] font-semibold text-ink wrap-anywhere">
          {section ? (
            <>
              <span className="mr-2 tabular-nums">{section.section}</span>
              {section.title}
            </>
          ) : (
            book.file_name
          )}
        </h1>
        {onText ? (
          <Button icon={FileText} variant="primary" data-testid="spec-show-text" onClick={onText}>
            Show the text
          </Button>
        ) : null}
        <Button
          icon={Download}
          variant="secondary"
          data-testid="spec-pages-download"
          aria-label={`Download ${book.file_name}`}
          title={`Download ${book.file_name}`}
          loading={download.pendingId === book.file_id}
          onClick={() => {
            download.start(book.file_id, book.size);
          }}
        />
      </div>
      <FilePreview key={item.id} item={item} />
    </div>
  );
}
