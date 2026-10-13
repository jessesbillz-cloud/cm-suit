// A spec book as an item of the full-screen viewer: its pages through its folder's gate, one-click download, opened
// at a page, with the section bar over the pages and the sections left of them. `hub` opens a section's page in Files
// (the viewer is outside the router, so the caller hands it in).
import { downloadFile } from '../../data/download';
import type { SpecBook } from '../../data/specs';
import type { ViewerItem } from '../../ui/FileViewer';
import { SpecBar } from './SpecBar';
import { SpecSide } from './SpecSide';

type Preview = (fileId: string) => Promise<string>;

interface SpecItemOptions {
  startPage?: number | undefined;
  hub: (section: string) => void;
}

export function specViewerItem(projectId: string, book: SpecBook, preview: Preview, { startPage, hub }: SpecItemOptions): ViewerItem {
  return {
    id: book.file_id,
    name: book.file_name,
    kind: 'pdf',
    url: () => preview(book.file_id),
    download: () => downloadFile(book.file_id, book.size),
    startPage,
    pageBar: (nav) => <SpecBar projectId={projectId} book={book} nav={nav} onHub={hub} />,
    pageSide: (nav) => <SpecSide projectId={projectId} book={book} nav={nav} onHub={hub} />,
  };
}
