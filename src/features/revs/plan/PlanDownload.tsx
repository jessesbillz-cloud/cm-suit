// Download for a plan sheet (Revs): one tap, the original filename, logged, through the gate that shows the sheet
// (data/sheetUrl useDownloadPlanSheet), so whoever sees the plan may save it.
import { Download } from 'lucide-react';
import { downloadErrorMessage } from '../../../data/download';
import { useDownloadPlanSheet } from '../../../data/sheetUrl';
import { Button } from '../../../ui/Button';
import { useToast } from '../../../ui/Toast';

interface PlanDownloadProps {
  projectId: string;
  fileId: string;
  name: string | null;
  testId: string;
}

export function PlanDownload({ projectId, fileId, name, testId }: PlanDownloadProps) {
  const download = useDownloadPlanSheet();
  const toast = useToast();
  return (
    <Button
      size="sm"
      variant="quiet"
      icon={Download}
      aria-label={name ? `Download ${name}` : 'Download the sheet'}
      title="Download"
      className="!rounded-full"
      loading={download.isPending}
      data-testid={testId}
      onClick={() => {
        download.mutate({ projectId, fileId }, { onError: (e) => { toast.show({ tone: 'error', message: downloadErrorMessage(e) }); } });
      }}
    />
  );
}
