// A submitted daily report's PDF as an item of the file viewer (ui/FileViewer): shown through data/preview (the file's
// folder, the same gate its download asks), downloaded in one click with its original name. A signed record: no Delete.
import { downloadFile } from '../../data/download';
import type { DailyReportRow } from '../../data/dailies.types';
import type { ViewerItem } from '../../ui/FileViewer';

type Preview = (fileId: string) => Promise<string>;

export function dailyPdfItem(report: Pick<DailyReportRow, 'filename'>, fileId: string, preview: Preview): ViewerItem {
  return {
    id: fileId,
    name: report.filename ?? 'Daily report.pdf',
    kind: 'pdf',
    url: () => preview(fileId),
    download: () => downloadFile(fileId),
  };
}
