// Opens the spec reader from anywhere (a section number on a requirement, an RFI's reference, a correction's spec tag,
// a submittal's section, a quote's page): Files > Specs with the section's text in the main column and the book
// beside it, in the same window (Jesse, Oct 23: "I don't think opening windows is the right answer"). A number the
// book lacks opens the section's page (its submittals and RFIs). A page of a book opens its PDF pages there, in the
// section the page is in. The full-screen viewer closes first when it is open. Asks for the books only when tapped.
import { useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { messageOf } from '../../data/errors';
import { fileSectionsQuery } from '../../data/fileSections';
import { specBooksQuery } from '../../data/specs';
import { useFileViewer } from '../../ui/FileViewer';
import { useToast } from '../../ui/Toast';
import { placeSearch, sectionPlace, type SpecPlace } from './specPlace';
import { bookWith, sectionAt, sectionKey } from './sections';

type SpecTarget = { section: string } | { fileId: string; page: number };

export function useOpenSpec(projectId: string): (to: SpecTarget) => void {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const viewer = useFileViewer();
  const toast = useToast();

  return useCallback(
    (to: SpecTarget) => {
      const show = async () => {
        const [books, sections] = await Promise.all([qc.query(specBooksQuery(projectId)), qc.query(fileSectionsQuery(projectId))]);
        const folder = sections.find((s) => s.kind === 'specs')?.folder_id;
        let place: Partial<SpecPlace>;
        if ('fileId' in to) {
          // A book just added may not be in a recent answer yet.
          const book =
            books.find((b) => b.file_id === to.fileId) ??
            (await qc.query({ ...specBooksQuery(projectId), staleTime: 0 })).find((b) => b.file_id === to.fileId);
          if (!book) throw new Error('That spec book is not in Specs any more.');
          const s = book.sections[sectionAt(book.sections, to.page)];
          place = { ...(s ? sectionPlace(book, s) : { vol: book.file_id }), pages: to.page };
        } else {
          const key = sectionKey(to.section);
          if (key === null) return;
          const hit = bookWith(books, to.section);
          place = hit ? sectionPlace(hit.book, hit.section) : { spec: key };
        }
        viewer.close();
        void navigate({ to: '/p/$projectId/$tool', params: { projectId, tool: 'files' }, search: placeSearch(folder, place) });
      };
      show().catch((e: unknown) => {
        toast.show({ message: messageOf(e), tone: 'error' });
      });
    },
    [qc, navigate, viewer, toast, projectId],
  );
}
