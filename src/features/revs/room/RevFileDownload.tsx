// Download for a room's image or a sign-off's OFS IR: one tap, the original filename, logged, through the gate that
// shows it (data/revs.history downloadRevFile), so whoever sees it may save it.
import { useState } from 'react';
import { Download } from 'lucide-react';
import { downloadErrorMessage } from '../../../data/download';
import { downloadRevFile } from '../../../data/revs.history';
import { Button } from '../../../ui/Button';
import { useToast } from '../../../ui/Toast';

interface RevFileDownloadProps {
  projectId: string;
  fileId: string;
  name: string | null;
  testId: string;
}

export function RevFileDownload({ projectId, fileId, name, testId }: RevFileDownloadProps) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  return (
    <Button
      size="sm"
      variant="quiet"
      icon={Download}
      aria-label={name ? `Download ${name}` : 'Download'}
      title="Download"
      className="!rounded-full"
      loading={busy}
      data-testid={testId}
      onClick={() => {
        setBusy(true);
        downloadRevFile(projectId, fileId)
          .catch((e: unknown) => {
            toast.show({ tone: 'error', message: downloadErrorMessage(e) });
          })
          .finally(() => {
            setBusy(false);
          });
      }}
    />
  );
}
