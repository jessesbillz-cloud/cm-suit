// Download from the viewer: the item's own download, a spinner on its button, and a toast when it fails.
import { useCallback, useState } from 'react';
import { downloadErrorMessage } from '../../data/download';
import type { ViewerItem } from '../FileViewer';
import { useToast } from '../Toast';

export function useViewerDownload() {
  const toast = useToast();
  const [pendingId, setPendingId] = useState<string | null>(null);
  const start = useCallback(
    (item: ViewerItem) => {
      setPendingId(item.id);
      item
        .download()
        .catch((e: unknown) => {
          toast.show({ tone: 'error', message: downloadErrorMessage(e) });
        })
        .finally(() => {
          setPendingId((id) => (id === item.id ? null : id));
        });
    },
    [toast],
  );
  return { pendingId, start };
}
