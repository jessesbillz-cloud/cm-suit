// One click, one download: every Download button in the app calls this (-> data/download -> lib/saveFile).
import { useCallback, useState } from 'react';
import { downloadErrorMessage, downloadFile } from '../../data/download';
import { useToast } from '../../ui/Toast';

export function useDownload() {
  const toast = useToast();
  const [pendingId, setPendingId] = useState<string | null>(null);

  const start = useCallback(
    (fileId: string, size?: number) => {
      setPendingId(fileId);
      downloadFile(fileId, size)
        .catch((e: unknown) => {
          toast.show({ tone: 'error', message: downloadErrorMessage(e) });
        })
        .finally(() => {
          setPendingId((id) => (id === fileId ? null : id));
        });
    },
    [toast],
  );

  return { pendingId, start };
}
