// Where Files is besides its folder: a spec section's page or the spec reader (?spec=092900 and the reader's own place,
// features/specs/specPlace), and the file or RFI opened from it. All in the URL, so Back returns from a file to the
// page. Router only.
import { useNavigate, useSearch } from '@tanstack/react-router';
import { placeSearch, useSpecPlace } from '../specs/specPlace';

export function useFilesNav(projectId: string) {
  const navigate = useNavigate();
  const search: { folder?: string | undefined } = useSearch({ strict: false });
  const place = useSpecPlace();
  const params = { projectId, tool: 'files' };
  return {
    /** A file from the section's page: its pane in the right column, the page staying. */
    openFile: (fileId: string) => {
      void navigate({ to: '/p/$projectId/$tool/$itemId', params: { ...params, itemId: fileId }, search: placeSearch(search.folder, place) });
    },
    openRfi: (rfiId: string) => {
      void navigate({ to: '/p/$projectId/$tool/$itemId', params: { projectId, tool: 'rfis', itemId: rfiId } });
    },
  };
}
