// Full screen from a Files list: the list's photos and PDFs I may open now, walked with the arrows, in the list's order.
// In Specs a spec book opens with its section bar (a book just added is asked for again once, so it has its bar). A
// submittal whose section is in the spec book has "Spec 09 29 00" and Related over its pages (`specFor`, Jesse, Oct 12).
import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useUser } from '../../data/auth';
import { usePreviewFetch } from '../../data/preview';
import { specBooksQuery } from '../../data/specs';
import type { FileRow } from '../../data/types';
import { useFileViewer } from '../../ui/FileViewer';
import { SpecViewerBar } from '../specs/SpecButton';
import { specViewerItem } from '../specs/specItem';
import { useOpenSpec } from '../specs/useOpenSpec';
import { useSpecHub } from '../specs/useSpecHub';
import { canOpenNow } from './scanStatus';
import { fileViewerItem } from './viewerItems';

export function useRowViewer(
  projectId: string,
  rows: readonly FileRow[],
  specs: boolean,
  specFor: (fileName: string) => string | null = () => null,
) {
  const viewer = useFileViewer();
  const preview = usePreviewFetch();
  const user = useUser();
  const openSpec = useOpenSpec(projectId);
  const hub = useSpecHub(projectId);
  const books = useQuery({ ...specBooksQuery(projectId), enabled: specs });
  const list = rows
    .filter((f) => canOpenNow(f, user.id))
    .map((f) => {
      const book = books.data?.find((b) => b.file_id === f.id);
      if (book) return specViewerItem(projectId, book, preview, { hub });
      const item = fileViewerItem(f, preview);
      const section = specFor(f.original_name);
      if (section === null) return item;
      const bar = (
        <SpecViewerBar
          section={section}
          onSpec={() => {
            openSpec({ section });
          }}
          onHub={() => {
            hub(section);
          }}
        />
      );
      return { ...item, pageBar: () => bar };
    })
    .filter((i) => i.kind !== 'other');
  const known = books.data;
  const newBook = specs && known !== undefined && list.some((i) => i.kind === 'pdf' && !known.some((b) => b.file_id === i.id));
  const refetchBooks = books.refetch;
  useEffect(() => {
    if (newBook) void refetchBooks();
  }, [newBook, refetchBooks]);

  return {
    viewable: new Set(list.map((i) => i.id)),
    view: (fileId: string) => {
      viewer.open(list, list.findIndex((i) => i.id === fileId));
    },
  };
}
