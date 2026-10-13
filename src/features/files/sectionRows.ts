// A section's list in Files: every file in the section's folders as one flat list (Jesse, Oct 11), narrowed to a folder
// under it and to what the search box says (name, sheet, section, company, stamp as shown), each with its section's columns,
// sorted by its file name: sheets by number in Plans, submittals by section then number.
import type { FileSection } from '../../data/fileSections';
import type { FileRow, FolderRow } from '../../data/types';
import type { SectionKind } from './classify';
import { STATUS, stampOutcome } from '../../lib/status';
import { bySheet, bySubmittal } from './fileNames';
import { rowView, type RowView, type StampMode } from './rowView';
import { companyIn } from './sections';

interface ShownRow {
  file: FileRow;
  view: RowView;
}

/** The stamp as the row shows it, for the search. */
function shownStamp(stamp: string | null, stamps: StampMode): string {
  if (stamp === null || stamps === 'unknown') return '';
  if (stamps === 'codes') return stamp;
  const outcome = stampOutcome(stamp);
  return outcome === null ? '' : STATUS[outcome].label;
}

function words(r: ShownRow): string {
  const v = r.view;
  const parts = [r.file.original_name];
  if (v.kind === 'sheet' && v.sheet) parts.push(v.sheet.sheet, v.sheet.title);
  if (v.kind === 'submittal') {
    parts.push(v.company);
    if (v.sub) parts.push(v.sub.section, v.sub.section.replace(/\s/g, ''), v.sub.no ?? '', v.sub.title, shownStamp(v.sub.stamp, v.stamps));
  }
  return parts.join(' ').toLowerCase();
}

const ORDER: Partial<Record<SectionKind, (a: string, b: string) => number>> = { plans: bySheet, submittals: bySubmittal };

export function sectionRows(
  files: readonly FileRow[],
  kind: SectionKind,
  section: FileSection,
  folders: readonly Pick<FolderRow, 'id' | 'parent_id' | 'name' | 'person' | 'app_only'>[],
  within: ReadonlySet<string> | null,
  query: string,
  stamps: StampMode = 'codes',
): ShownRow[] {
  const q = query.trim().toLowerCase();
  const order = ORDER[kind] ?? ((a: string, b: string) => a.localeCompare(b, 'en', { numeric: true }));
  return files
    .filter((f) => within === null || within.has(f.folder_id))
    .map((file) => ({
      file,
      view: rowView(
        kind,
        file.original_name,
        kind === 'submittals' ? companyIn(section, file.folder_id, folders) : '',
        stamps,
        file.spec_section ?? null,
      ),
    }))
    .filter((r) => q === '' || words(r).includes(q))
    .sort((a, b) => order(a.file.original_name, b.file.original_name));
}
