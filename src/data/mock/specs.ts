// e2e mock of the spec book (0088, 0118): each sample job's synthetic project manual in Specs, already read, its
// sections on the mock PDF's three pages, and Job A's second volume. A section's text is synthetic page text written
// here, parsed by the server's own parser (supabase/functions/_shared/specText.ts). Job A's 26 51 00 is a scan (no
// text layer). A visitor on a link (not a member) reads no spec book.
import { normLine, parseSection } from '../../../supabase/functions/_shared/specText';
import type { SpecBook, SpecSectionText } from '../specs';
import * as api from './api';
import { mockSignedOut } from './index';
import { delay } from './store';

type Section = SpecBook['sections'][number];

const section = (number: string, title: string, page: number): Section => ({ section: number, title, first_page: page, last_page: page });

function book(fileId: string, name: string, sections: Section[]): SpecBook {
  return { file_id: fileId, file_name: name, size: 52_418, page_count: 3, text_ready: true, sections };
}

const BOOKS: Record<string, SpecBook[]> = {
  'job-a': [
    book('job-a-file-manual', 'Sample Project Manual.pdf', [
      section('09 21 16', 'Gypsum Board Assemblies', 1),
      section('09 29 00', 'Gypsum Board', 2),
      section('10 28 00', 'Toilet Accessories', 3),
    ]),
    book('job-a-file-manual-2', 'Sample Project Manual Volume 2.pdf', [
      section('22 11 16', 'Domestic Water Piping', 1),
      section('26 05 19', 'Low-Voltage Electrical Power Conductors and Cables', 2),
      section('26 51 00', 'Interior Lighting', 3),
    ]),
  ],
  // Job B's submittals (mock/fileSeeds) name 07 21 00, 07 92 00 and 09 29 00; 09 24 00 is not in its book.
  'job-b': [
    book('job-b-file-manual', 'Sample Project Manual B.pdf', [
      section('07 21 00', 'Thermal Insulation', 1),
      section('07 92 00', 'Joint Sealants', 2),
      section('09 29 00', 'Gypsum Board', 3),
    ]),
  ],
};

const SCANS = new Set(['job-a-file-manual-2:3']);
/** The running head on every page of the sample books (the server finds these with spec_text_running). */
const RUNNING = new Set([normLine('SAMPLE SCHOOL MODERNIZATION')]);

export async function books(projectId: string): Promise<SpecBook[]> {
  await delay();
  if (mockSignedOut()) return [];
  const out: SpecBook[] = [];
  for (const b of BOOKS[projectId] ?? []) if ((await api.file(b.file_id)) !== null) out.push(b);
  return out;
}

/** A sample section as a spec writer lays it out, with the page's running head and footer. */
function samplePage(s: Section): string {
  const title = s.title.toUpperCase();
  return [
    'SAMPLE SCHOOL MODERNIZATION',
    `SECTION ${s.section}`,
    title,
    'PART 1 - GENERAL',
    '1.01 SUMMARY',
    'A. Section Includes:',
    `1. ${s.title} for the sample building, complete as shown on the`,
    'drawings.',
    '2. Coordination with adjacent work.',
    '1.02 SUBMITTALS',
    'A. Product Data: For each type of product.',
    'B. Samples: For each finish, on 12 by 12 inch panels.',
    'PART 2 - PRODUCTS',
    '2.01 MATERIALS',
    'A. Sample product:',
    '1. Performance:',
    'a. Comply with the sample standard.',
    'b. Provide the manufacturer\'s standard finish.',
    'PART 3 - EXECUTION',
    '3.01 INSTALLATION',
    'A. Install according to the manufacturer\'s written instructions.',
    'END OF SECTION',
    `${title} ${s.section} - 1`,
  ].join('\n');
}

export async function sectionText(fileId: string, firstPage: number): Promise<SpecSectionText | null> {
  await delay();
  const found = Object.values(BOOKS).flat().find((b) => b.file_id === fileId);
  const s = found?.sections.find((x) => x.first_page === firstPage);
  if (!s || mockSignedOut()) return null;
  if (SCANS.has(`${fileId}:${String(firstPage)}`)) return { status: 'no_text', body: [] };
  const parsed = parseSection({ section: s.section, title: s.title, pages: [{ page: firstPage, text: samplePage(s) }] }, RUNNING);
  return { status: parsed.status, body: parsed.body };
}
