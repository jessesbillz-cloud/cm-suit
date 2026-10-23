// Upload submittal / Upload RFI on the designated person's start page: the files go where Files puts them (Submittals,
// or RFIs' Uploaded folder) through the one uploader, their spec sections found the way Files finds them (the name, else
// the PDF's words; Submittals asks only when neither says), and each one goes to OFS marked fire / life safety.
import { useQueryClient } from '@tanstack/react-query';
import { messageOf } from '../../data/errors';
import { useWritableFolders } from '../../data/files';
import { useFileSections } from '../../data/fileSections';
import { qk } from '../../data/keys';
import { markUploaded } from '../../data/ofs';
import { useFolders } from '../../data/queries';
import { useUploadQueue, type AfterUpload } from '../../data/UploadQueue';
import { useToast } from '../../ui/Toast';
import type { DroppedFile } from '../files/collectDrop';
import { uploadFolder } from '../files/sections';
import { useSubmittalNaming } from '../files/useSubmittalNaming';

export type DeskKind = 'submittals' | 'rfis';

export function useDeskUpload(projectId: string, kind: DeskKind) {
  const sections = useFileSections(projectId);
  const folders = useFolders(projectId);
  const writable = useWritableFolders(projectId);
  const queue = useUploadQueue();
  const qc = useQueryClient();
  const toast = useToast();
  const section = sections.data?.find((s) => s.kind === kind) ?? null;
  const folder = section !== null && folders.data && writable.data ? uploadFolder(section, folders.data, writable.data) : null;

  const send = (dropped: DroppedFile[], after: AfterUpload) => {
    if (folder === null) {
      toast.show({ tone: 'error', message: 'Nowhere here takes files from you.' });
      return;
    }
    queue.enqueue(
      dropped.map((d) => d.file),
      projectId,
      folder,
      async (fileId, file) => {
        const note = await after(fileId, file);
        try {
          await markUploaded(projectId, fileId);
        } catch (e) {
          return `Not sent to OFS: ${messageOf(e)}`;
        }
        await Promise.all([qc.invalidateQueries({ queryKey: qk.ofs }), qc.invalidateQueries({ queryKey: qk.toolCounts(projectId) })]);
        return note;
      },
    );
  };
  const naming = useSubmittalNaming(projectId, kind, send);

  return {
    loading: sections.isPending || folders.isPending || writable.isPending,
    error: sections.error ?? folders.error ?? writable.error,
    retry: () => {
      void sections.refetch();
      void folders.refetch();
      void writable.refetch();
    },
    folder,
    start: (files: File[]) => {
      naming.start(files.map((file) => ({ file, dir: [] })));
    },
    prompt: naming.prompt,
  };
}
