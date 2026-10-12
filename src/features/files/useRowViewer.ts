// Full screen from a Files list: the list's photos and PDFs I may open now, walked with the arrows, in the list's order.
// In Specs a spec book opens with its section bar (a book just added is asked for again once, so it has its bar).
import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useUser } from '../../data/auth';
import { usePreviewFetch } from '../../data/preview';
import { specBooksQuery } from '../../data/specs';
import type { FileRow } from '../../data/types';
import { useFileViewer } from '../../ui/FileViewer';
import { specViewerItem } from '../specs/specItem';
import { canOpenNow } from './scanStatus';
import { fileViewerItem } from './viewerItems';

export function useRowViewer(projectId: string, rows: readonly FileRow[], specs: boolean) {
  const viewer = useFileViewer();
  const preview = usePreviewFetch();
  const user = useUser();
  const books = useQuery({ ...specBooksQuery(projectId), enabled: specs });
  const list = rows
    .filter((f) => canOpenNow(f, user.id))
    .map((f) => {
      const book = books.data?.find((b) => b.file_id === f.id);
      return book ? specViewerItem(projectId, book, preview) : fileViewerItem(f, preview);
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
