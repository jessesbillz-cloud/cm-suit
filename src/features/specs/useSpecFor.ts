// The spec section a file opens to, when it is a submittal (its name starts with the section) and the job's spec book
// has that section: the newest book's own number for it. Null otherwise, while the books load, and when not enabled.
import { useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { specBooksQuery } from '../../data/specs';
import { bookWith, sectionOfName } from './sections';

export function useSpecFor(projectId: string, enabled = true): (fileName: string) => string | null {
  const books = useQuery({ ...specBooksQuery(projectId), enabled });
  // Off means off, even when another screen already has the books.
  const data = enabled ? books.data : undefined;
  return useCallback(
    (fileName: string) => {
      const wanted = sectionOfName(fileName);
      if (!data || wanted === null) return null;
      return bookWith(data, wanted)?.section.section ?? null;
    },
    [data],
  );
}
