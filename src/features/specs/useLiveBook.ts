// The spec book as the server has it now: its sections appear once found, after the book was opened without them.
import { useQuery } from '@tanstack/react-query';
import { specBooksQuery, type SpecBook } from '../../data/specs';

export function useLiveBook(projectId: string, opened: SpecBook): SpecBook {
  const books = useQuery(specBooksQuery(projectId));
  return books.data?.find((b) => b.file_id === opened.file_id) ?? opened;
}
