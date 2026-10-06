// e2e mock of the spec book (0088): job A's synthetic project manual in Specs, already read, its sections on the mock
// PDF's three pages. Nobody needs to send its text.
import type { SpecBook } from '../specs';
import * as api from './api';
import { delay } from './store';

const MANUAL_ID = 'job-a-file-manual';

export async function books(projectId: string): Promise<SpecBook[]> {
  await delay();
  if (projectId !== 'job-a' || (await api.file(MANUAL_ID)) === null) return [];
  return [
    {
      file_id: MANUAL_ID,
      file_name: 'Sample Project Manual.pdf',
      size: 52_418,
      page_count: 3,
      text_ready: true,
      can_send: false,
      sections: [
        { section: '09 21 16', title: 'Gypsum Board Assemblies', first_page: 1, last_page: 1 },
        { section: '09 29 00', title: 'Gypsum Board', first_page: 2, last_page: 2 },
        { section: '10 28 00', title: 'Toilet Accessories', first_page: 3, last_page: 3 },
      ],
    },
  ];
}

export async function savePages(fileId: string): Promise<number | null> {
  await delay();
  return (await books('job-a')).find((b) => b.file_id === fileId)?.sections.length ?? null;
}
