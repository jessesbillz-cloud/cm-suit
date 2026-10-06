// A spec book as an item of the full-screen viewer: its pages through its folder's gate, one-click download, opened
// at a page, with the section bar over the pages.
import { downloadFile } from '../../data/download';
import type { SpecBook } from '../../data/specs';
import type { ViewerItem } from '../../ui/FileViewer';
import { SpecBar } from './SpecBar';

type Preview = (fileId: string) => Promise<string>;

export function specViewerItem(projectId: string, book: SpecBook, preview: Preview, startPage?: number, remove?: () => void): ViewerItem {
  return {
    id: book.file_id,
    name: book.file_name,
    kind: 'pdf',
    url: () => preview(book.file_id),
    download: () => downloadFile(book.file_id, book.size),
    remove,
    startPage,
    pageBar: (nav) => <SpecBar projectId={projectId} book={book} nav={nav} />,
  };
}
