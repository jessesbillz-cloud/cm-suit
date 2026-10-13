// Uploads in Files go where their names say (classify), never by a question: a mixed drop lands in each section, a
// dropped folder keeps its folders under the section most of its files point to (making folders takes files.manage),
// and an OFS IR goes to Reports / OFS history and is linked to its sign-offs, as Revs adds it (revs.manage, 0094).
// A section whose folder only the app fills takes uploads in the folder under it I may add to (RFIs' Uploaded, 0099).
// A file whose section can't take it here goes to To sort, else where the person is looking. After a drop that went
// anywhere but there, one toast says where: "Sorted: 6 Plans, 434 Submittals, 2 To sort". `after` runs after each upload
// (its spec section, useSubmittalNaming), but an OFS IR's, which is its link to Revs.
import { useQueryClient } from '@tanstack/react-query';
import { refusalOf } from '../../data/errors';
import type { FileSection } from '../../data/fileSections';
import { useEnsureFolders } from '../../data/folders.mutations';
import { linkRevFile, revFolder } from '../../data/revs.rooms';
import type { FolderRow } from '../../data/types';
import { useUploadQueue, type AfterUpload } from '../../data/UploadQueue';
import { useToast } from '../../ui/Toast';
import { sortDrop, type SectionKind } from './classify';
import type { DroppedFile } from './collectDrop';
import { dirKey, planDrop } from './dropPlan';
import { howMany } from './outcomes';
import { SECTION_LABEL, uploadFolder } from './sections';

interface SortArgs {
  projectId: string;
  sections: readonly FileSection[];
  viewing: SectionKind;
  /** The folder on screen (the filter's, else the section's). */
  viewFolder: FolderRow;
  folders: readonly FolderRow[];
  /** The folders I may add to (my_writable_folders). */
  writable: ReadonlySet<string> | undefined;
  manager: boolean;
  /** May add OFS IRs to Revs (revs.manage). */
  revs: boolean;
}

export function useSortUpload(args: SortArgs): (dropped: DroppedFile[], after?: AfterUpload) => void {
  const { projectId, sections, viewing, viewFolder, folders, writable, manager, revs } = args;
  const qc = useQueryClient();
  const queue = useUploadQueue();
  const ensure = useEnsureFolders();
  const toast = useToast();
  const fail = (message: string) => {
    toast.show({ tone: 'error', message });
  };

  const takes = (id: string | undefined): id is string =>
    id !== undefined && writable?.has(id) === true && folders.some((f) => f.id === id && !f.app_only);
  const rootOf = (k: SectionKind) => sections.find((s) => s.kind === k)?.folder_id;

  /** The section and folder a group goes to. */
  function place(kind: SectionKind | null): { kind: SectionKind; folder: string } | null {
    const k = kind ?? viewing;
    if (k === viewing && takes(viewFolder.id)) return { kind: k, folder: viewFolder.id };
    const section = sections.find((s) => s.kind === k);
    const into = section && writable ? uploadFolder(section, folders, writable) : null;
    if (into !== null) return { kind: k, folder: into };
    const unsorted = rootOf('unsorted');
    if (takes(unsorted)) return { kind: 'unsorted', folder: unsorted };
    return takes(viewFolder.id) ? { kind: viewing, folder: viewFolder.id } : null;
  }

  const linkNow: AfterUpload = async (fileId) => {
    const r = await linkRevFile(projectId, fileId);
    return r.rooms + r.signoffs > 0 ? 'Linked' : 'Not matched';
  };

  function addOfs(files: File[]) {
    revFolder(qc, projectId, 'history').then(
      (folder) => {
        queue.enqueue(files, projectId, folder, linkNow);
      },
      (e: unknown) => {
        fail(`${howMany(files.map((f) => f.name))} not added: ${refusalOf(e)}`);
      },
    );
  }

  function addTree(items: readonly DroppedFile[], parent: string, after: AfterUpload | undefined) {
    const { dirs, groups } = planDrop(items);
    const aiReads = folders.find((f) => f.id === parent)?.ai_reads ?? true;
    ensure.mutateAsync({ projectId, parentId: parent, aiReads, dirs }).then(
      (ids) => {
        for (const g of groups) {
          const target = ids.get(dirKey(g.dir));
          if (target === undefined) fail(`Not uploaded: no folder for ${dirKey(g.dir)}.`);
          else queue.enqueue(g.files, projectId, target, after);
        }
      },
      (e: unknown) => {
        fail(`Folders not added: ${refusalOf(e)}`);
      },
    );
  }

  return (dropped, after) => {
    if (dropped.length === 0) return;
    const sent = new Map<SectionKind, number>();
    const count = (k: SectionKind, n: number) => sent.set(k, (sent.get(k) ?? 0) + n);
    for (const g of sortDrop(dropped, viewing)) {
      const files = g.items.map((d) => d.file);
      if (g.kind === 'reports' && revs) {
        addOfs(files);
        count('reports', files.length);
        continue;
      }
      const to = place(g.kind);
      if (to === null) {
        fail(`${howMany(files.map((f) => f.name))} not added: nowhere here takes files from you.`);
        continue;
      }
      if (g.tree && !manager) {
        fail('Only a files manager can add folders. Drop the files instead.');
        continue;
      }
      count(to.kind, files.length);
      // A folder named for its section ("Approved Submittals"): what is in it goes right into the section.
      const into = g.intoSection && to.kind === g.kind;
      if (g.tree) addTree(into ? g.items.map((d) => ({ ...d, dir: d.dir.slice(1) })) : g.items, to.folder, after);
      else queue.enqueue(files, projectId, to.folder, after);
    }
    if ([...sent.keys()].some((k) => k !== viewing)) {
      const parts = [...sent].map(([k, n]) => `${String(n)} ${SECTION_LABEL[k]}`);
      toast.show({ message: `Sorted: ${parts.join(', ')}` });
    }
  };
}
