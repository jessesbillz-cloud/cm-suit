// Opens the spec book full screen from anywhere (a section number on a requirement, an RFI's reference, a correction's
// spec tag, a quote's page): at the section's first page, or at a page of a given book. Asks for the job's books only
// when tapped. A number the book doesn't have opens the book at its first page and says so.
import { useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { messageOf } from '../../data/errors';
import { usePreviewFetch } from '../../data/preview';
import { specBooksQuery } from '../../data/specs';
import { useFileViewer } from '../../ui/FileViewer';
import { useToast } from '../../ui/Toast';
import { findSection } from './sections';
import { specViewerItem } from './specItem';

type SpecTarget = { section: string } | { fileId: string; page: number };

export function useOpenSpec(projectId: string): (to: SpecTarget) => void {
  const qc = useQueryClient();
  const viewer = useFileViewer();
  const preview = usePreviewFetch();
  const toast = useToast();

  return useCallback(
    (to: SpecTarget) => {
      const show = async () => {
        const books = await qc.fetchQuery(specBooksQuery(projectId));
        const first = books[0];
        if ('fileId' in to) {
          // A book just added may not be in a recent answer yet.
          const book =
            books.find((b) => b.file_id === to.fileId) ??
            (await qc.fetchQuery({ ...specBooksQuery(projectId), staleTime: 0 })).find((b) => b.file_id === to.fileId);
          if (!book) throw new Error('That spec book is not in Specs any more.');
          viewer.open([specViewerItem(projectId, book, preview, to.page)]);
          return;
        }
        if (!first) throw new Error('No spec book in Specs yet.');
        for (const book of books) {
          const s = findSection(book.sections, to.section);
          if (s) {
            viewer.open([specViewerItem(projectId, book, preview, s.first_page)]);
            return;
          }
        }
        viewer.open([specViewerItem(projectId, first, preview)]);
        toast.show({ message: `${to.section} is not in the spec book's sections.` });
      };
      show().catch((e: unknown) => {
        toast.show({ message: messageOf(e), tone: 'error' });
      });
    },
    [qc, viewer, preview, toast, projectId],
  );
}
