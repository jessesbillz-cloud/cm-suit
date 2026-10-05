// A stored file as an item of the file viewer (ui/FileViewer): shown through data/preview (its folder's gate),
// downloaded through data/download (one click, the original name). A list that knows only the name (no type) lets the
// name decide what it is (lib/fileKind).
import { downloadFile } from '../../data/download';
import type { PreviewVia } from '../../data/preview';
import type { FileRow } from '../../data/types';
import { fileKind } from '../../lib/fileKind';
import type { ViewerItem } from '../../ui/FileViewer';

type Preview = (fileId: string, via?: PreviewVia) => Promise<string>;

type Viewable = Pick<FileRow, 'id' | 'original_name' | 'size'> & { mime?: string | null | undefined };

export function fileViewerItem(f: Viewable, preview: Preview, remove?: () => void): ViewerItem {
  return {
    id: f.id,
    name: f.original_name,
    kind: fileKind(f.original_name, f.mime),
    url: () => preview(f.id),
    download: () => downloadFile(f.id, f.size),
    remove,
  };
}
