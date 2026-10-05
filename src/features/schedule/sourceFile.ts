// A schedule's original file (an XER, a CSV, a PDF or a photo in the job's Schedule folder) as an item of the file
// viewer: a photo or a PDF shows (data/preview, the folder's gate); anything else is a Download. Download is the one
// schedule download path (downloadScheduleFile).
import { usePreviewFetch } from '../../data/preview';
import { useFile } from '../../data/queries';
import { downloadScheduleFile } from '../../data/schedule.mutations';
import { fileKind } from '../../lib/fileKind';
import type { ViewerItem } from '../../ui/FileViewer';

export function useSourceItem(fileId: string | null, name: string | null): ViewerItem | null {
  const file = useFile(fileId);
  const preview = usePreviewFetch();
  if (fileId === null) return null;
  const shown = file.data?.original_name ?? name ?? 'Schedule file';
  return {
    id: fileId,
    name: shown,
    kind: fileKind(shown, file.data?.mime),
    url: () => preview(fileId),
    download: () => downloadScheduleFile(fileId),
  };
}
