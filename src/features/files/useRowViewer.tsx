// Full screen from a Files list: the list's photos and PDFs I may open now, walked with the arrows, in the list's order.
// A spec book is not one of them: it opens in the spec reader (Files > Specs, its pages in the main column, 0118). A
// submittal whose section is in the spec book has "Spec 09 29 00" over its pages (`specFor`, Jesse, Oct 12).
import { useUser } from '../../data/auth';
import { usePreviewFetch } from '../../data/preview';
import type { FileRow } from '../../data/types';
import { useFileViewer } from '../../ui/FileViewer';
import { SpecViewerBar } from '../specs/SpecButton';
import { useOpenSpec } from '../specs/useOpenSpec';
import { canOpenNow } from './scanStatus';
import { fileViewerItem } from './viewerItems';

export function useRowViewer(
  projectId: string,
  rows: readonly FileRow[],
  books: ReadonlySet<string>,
  specFor: (fileName: string, stored?: string | null) => string | null = () => null,
) {
  const viewer = useFileViewer();
  const preview = usePreviewFetch();
  const user = useUser();
  const openSpec = useOpenSpec(projectId);
  const list = rows
    .filter((f) => canOpenNow(f, user.id) && !books.has(f.id))
    .map((f) => {
      const item = fileViewerItem(f, preview);
      const section = specFor(f.original_name, f.spec_section);
      if (section === null) return item;
      const bar = (
        <SpecViewerBar
          section={section}
          onSpec={() => {
            openSpec({ section });
          }}
        />
      );
      return { ...item, pageBar: () => bar };
    })
    .filter((i) => i.kind !== 'other');

  return {
    viewable: new Set(list.map((i) => i.id)),
    view: (fileId: string) => {
      if (books.has(fileId)) {
        openSpec({ fileId, page: 1 });
        return;
      }
      viewer.open(list, list.findIndex((i) => i.id === fileId));
    },
  };
}
