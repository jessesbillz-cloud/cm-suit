// A stored file as an item of the file viewer (ui/FileViewer): shown through data/preview (its folder's gate),
// downloaded through data/download (one click, the original name).
import { downloadFile } from '../../data/download';
import type { PreviewVia } from '../../data/preview';
import type { FileRow } from '../../data/types';
import { fileKind } from '../../lib/fileKind';
import type { ViewerItem } from '../../ui/FileViewer';

type Preview = (fileId: string, via?: PreviewVia) => Promise<string>;

export function fileViewerItem(f: Pick<FileRow, 'id' | 'original_name' | 'mime' | 'size'>, preview: Preview, remove?: () => void): ViewerItem {
  return {
    id: f.id,
    name: f.original_name,
    kind: fileKind(f.original_name, f.mime),
    url: () => preview(f.id),
    download: () => downloadFile(f.id, f.size),
    remove,
  };
}
