// The spec section a file opens to, when it is filed under one (its hidden spec section, 0105, else its name's) and the
// job's spec book has that section: the newest book's own number for it. Null otherwise, while the books load, and when
// not enabled.
import { useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { specBooksQuery } from '../../data/specs';
import { bookWith, sectionOfName } from './sections';

export function useSpecFor(projectId: string, enabled = true): (fileName: string, stored?: string | null) => string | null {
  const books = useQuery({ ...specBooksQuery(projectId), enabled });
  // Off means off, even when another screen already has the books.
  const data = enabled ? books.data : undefined;
  return useCallback(
    (fileName: string, stored?: string | null) => {
      const wanted = stored ?? sectionOfName(fileName);
      if (!data || wanted === null) return null;
      return bookWith(data, wanted)?.section.section ?? null;
    },
    [data],
  );
}
