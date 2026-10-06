// A room's image or a sign-off's OFS IR as a file viewer item (ui/FileViewer): its URL and Download through Revs' own
// gate (data/revs.history: a preview, or a download, both logged), so whoever reads revs sees it, Files folder or not.
import { downloadRevFile, type RevFile } from '../../../data/revs.history';
import { fileKind } from '../../../lib/fileKind';
import type { ViewerItem } from '../../../ui/FileViewer';

export function revFileItem(
  projectId: string,
  fileId: string,
  name: string,
  fetchFile: (projectId: string, fileId: string) => Promise<RevFile>,
): ViewerItem {
  return {
    id: `rev-file:${fileId}`,
    name,
    kind: fileKind(name),
    url: async () => (await fetchFile(projectId, fileId)).url,
    download: () => downloadRevFile(projectId, fileId),
  };
}
