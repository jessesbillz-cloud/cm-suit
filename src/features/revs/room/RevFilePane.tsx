// A sign-off's OFS IR beside its wall's page, in the right column (0083: a wall's history row, ?side=revs:file-<id>):
// the file in the viewer's box (zoom, a PDF's pages) and Download, through Revs' own gate. The column's own Full screen
// (Back, Escape) is the one way to enlarge it there (Jesse, Oct 10); in its own window the box has Full screen.
import { useRevFile, useRevFileFetch } from '../../../data/revs.history';
import { FilePreview, useFileViewer } from '../../../ui/FileViewer';
import { ErrorState, LoadingState } from '../../../ui/States';
import { revFileItem } from './revFileItem';

interface RevFilePaneProps {
  projectId: string;
  fileId: string;
}

export function RevFilePane({ projectId, fileId }: RevFilePaneProps) {
  const file = useRevFile(projectId, fileId);
  const fetchFile = useRevFileFetch();
  const viewer = useFileViewer();
  if (file.isError) return <ErrorState error={file.error} title="The file did not open." onRetry={() => void file.refetch()} />;
  if (file.isPending) return <LoadingState label="Opening the file" />;
  const item = revFileItem(projectId, fileId, file.data.filename, fetchFile);
  return (
    <div className="flex h-full flex-col gap-2 p-3" data-testid="rev-file-pane">
      <p className="break-words text-[14px] font-medium text-ink">{file.data.filename}</p>
      <FilePreview item={item} className="min-h-[360px] flex-1" onFullScreen={() => { viewer.open([item]); }} />
    </div>
  );
}
