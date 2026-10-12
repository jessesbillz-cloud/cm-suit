// e2e mock of the spec book (0088): each sample job's synthetic project manual in Specs, already read, its sections on
// the mock PDF's three pages. Nobody needs to send its text. A visitor on a link (not a member) reads no spec book.
import type { SpecBook } from '../specs';
import * as api from './api';
import { mockSignedOut } from './index';
import { delay } from './store';

type Section = SpecBook['sections'][number];

const section = (number: string, title: string, page: number): Section => ({ section: number, title, first_page: page, last_page: page });

function book(job: string, name: string, sections: Section[]): SpecBook {
  return { file_id: `${job}-file-manual`, file_name: name, size: 52_418, page_count: 3, text_ready: true, can_send: false, sections };
}

const BOOKS: Record<string, SpecBook> = {
  'job-a': book('job-a', 'Sample Project Manual.pdf', [
    section('09 21 16', 'Gypsum Board Assemblies', 1),
    section('09 29 00', 'Gypsum Board', 2),
    section('10 28 00', 'Toilet Accessories', 3),
  ]),
  // Job B's submittals (mock/fileSeeds) name 07 21 00, 07 92 00 and 09 29 00; 09 24 00 is not in its book.
  'job-b': book('job-b', 'Sample Project Manual B.pdf', [
    section('07 21 00', 'Thermal Insulation', 1),
    section('07 92 00', 'Joint Sealants', 2),
    section('09 29 00', 'Gypsum Board', 3),
  ]),
};

export async function books(projectId: string): Promise<SpecBook[]> {
  await delay();
  const found = BOOKS[projectId];
  if (!found || mockSignedOut() || (await api.file(found.file_id)) === null) return [];
  return [found];
}

export async function savePages(fileId: string): Promise<number | null> {
  await delay();
  return Object.values(BOOKS).find((b) => b.file_id === fileId)?.sections.length ?? null;
}
