// Opens a spec section's page in Files (its submittals, RFIs and CCDs, Jesse, Oct 12) from beside a "Spec 09 29 00"
// and from the spec book's section panel. The viewer closes first when it is open. Called where the router is; the
// viewer's own bars get the result as a callback.
import { useCallback } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { useFileViewer } from '../../ui/FileViewer';
import { sectionKey } from './sections';

export function useSpecHub(projectId: string): (section: string) => void {
  const navigate = useNavigate();
  const viewer = useFileViewer();
  return useCallback(
    (section: string) => {
      const key = sectionKey(section);
      if (key === null) return;
      viewer.close();
      void navigate({ to: '/p/$projectId/$tool', params: { projectId, tool: 'files' }, search: { spec: key } });
    },
    [navigate, viewer, projectId],
  );
}
