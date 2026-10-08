// A sign-off's OFS IR in the file viewer (a rev strip's done chip, a wall's history): its name and type first (the same
// cached answer the viewer then shows), through Revs' own gate (data/revs.history). A refusal says why in the toast. On
// a wall's page on a desktop it opens beside the page instead (`beside`).
import { useFileViewer } from '../../ui/FileViewer';
import { useToast } from '../../ui/Toast';
import { messageOf } from '../../data/errors';
import { useRevFileFetch } from '../../data/revs.history';
import { revFileItem } from './room/revFileItem';

export function useOpenRevFile(projectId: string, beside?: (fileId: string) => void): (fileId: string) => void {
  const viewer = useFileViewer();
  const fetchFile = useRevFileFetch();
  const toast = useToast();
  return (fileId: string) => {
    if (beside) {
      beside(fileId);
      return;
    }
    void fetchFile(projectId, fileId).then(
      (f) => {
        viewer.open([revFileItem(projectId, fileId, f.filename, fetchFile)]);
      },
      (e: unknown) => {
        toast.show({ tone: 'error', message: messageOf(e) });
      },
    );
  };
}
