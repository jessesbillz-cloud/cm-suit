// The plan sheets a wall can be given (0067 rev_sheet_ok): the job's PDFs I can read (RLS on files and folders), each
// with its folder's name, by folder then name. An upload that never finished isn't a file (nothing to draw), and an
// infected one is never offered, nor the PDFs the app makes itself (IRs, maps, daily reports: the Reports folders), nor
// the stamped copies waiting in "Stamping". A stamped set replaced by a newer one (Approved plans / <permit> /
// Superseded, 0053) is marked. Under the job's revs prefix, so a revs write refreshes it with the rest; asked again
// each time a picker opens, so a PDF just uploaded in Files is there.
import { useQuery } from '@tanstack/react-query';
import { supabase } from './client';
import { throwIfError } from './errors';
import { qk } from './keys';
import { isMock } from './mock';
import * as mock from './mock/api';

export interface RevSheet {
  id: string;
  name: string;
  folder: string;
  size: number;
  /** A stamped sheet of an earlier approved set. */
  superseded: boolean;
}

interface SheetFile {
  id: string;
  folder_id: string;
  original_name: string;
  mime: string;
  size: number;
  scan_status: string;
  upload_complete: boolean;
}

interface SheetFolder {
  id: string;
  name: string;
  sort: number;
  kind: string;
}

/** Never a sheet: the app's own PDFs, and stamped copies not recorded yet. */
const NOT_SHEETS = ['reports', 'stamping'];

/** The earlier approved sets' folder (permit_record_stamped_set, 0053). */
const isSuperseded = (f: SheetFolder) => f.kind === 'approved_plans' && f.name === 'Superseded';

async function fetchRaw(projectId: string): Promise<{ files: SheetFile[]; folders: SheetFolder[] }> {
  if (isMock()) {
    const folders = await mock.folders(projectId);
    const files = (await Promise.all(folders.map((f) => mock.files(f.id)))).flat();
    return { files, folders };
  }
  const [files, folders] = await Promise.all([
    supabase
      .from('files')
      .select('id, folder_id, original_name, mime, size, scan_status, upload_complete')
      .eq('project_id', projectId)
      .eq('mime', 'application/pdf')
      .is('deleted_at', null)
      .is('superseded_by', null),
    supabase.from('folders').select('id, name, sort, kind').eq('project_id', projectId).is('deleted_at', null),
  ]);
  return { files: throwIfError(files), folders: throwIfError(folders) };
}

async function fetchSheets(projectId: string): Promise<RevSheet[]> {
  const { files, folders } = await fetchRaw(projectId);
  const folderOf = new Map(folders.map((f) => [f.id, f]));
  return files
    .filter((f) => f.mime === 'application/pdf' && f.scan_status !== 'infected' && f.upload_complete)
    .flatMap((f) => {
      const folder = folderOf.get(f.folder_id);
      return folder && !NOT_SHEETS.includes(folder.kind) ? [{ file: f, folder }] : [];
    })
    .sort((a, b) => a.folder.sort - b.folder.sort || a.folder.name.localeCompare(b.folder.name) || a.file.original_name.localeCompare(b.file.original_name))
    .map(({ file, folder }) => ({
      id: file.id,
      name: file.original_name,
      folder: folder.name,
      size: file.size,
      superseded: isSuperseded(folder),
    }));
}

/** The job's PDFs I may pick as a wall's plan sheet. */
export function useRevSheets(projectId: string) {
  return useQuery({ queryKey: qk.revsPart(projectId, 'sheets'), queryFn: () => fetchSheets(projectId), staleTime: 0 });
}
