// Room pictures and old OFS IRs added from Revs (0094; Jesse, Oct 7: Files must not become "a black hole of just
// dumping documents in"). Many at once, from the picker or dropped: pictures go to the job's "Room pictures", PDFs to
// Reports / "OFS history" (the app's folders, made on first use), through the one upload queue (progress, Stop, Retry).
// Each file is linked the moment it is stored (rev_file_link), its line says Linked or Not matched, and when the last
// one settles one toast says what linked and what didn't. Anything else is refused up front.
import { useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { messageOf } from '../../../data/errors';
import { qk } from '../../../data/keys';
import { linkRevFile, revFolder, useKnownRevFolder } from '../../../data/revs.rooms';
import { useUploadQueue, type AfterUpload } from '../../../data/UploadQueue';
import { useToast } from '../../../ui/Toast';
import { addedLine, type Added } from './revFilesLine';

/** The pictures a room can show (rev_room_image_of). */
const PICTURE = /^image\/(jpeg|png|webp)$/i;
export const REV_FILES_ACCEPT = 'image/jpeg,image/png,image/webp,application/pdf,.pdf';

const isPdf = (f: File) => f.type === 'application/pdf';

export function useAddRevFiles(projectId: string) {
  const qc = useQueryClient();
  const queue = useUploadQueue();
  const toast = useToast();
  const pictures = useKnownRevFolder(projectId, 'pictures');
  const history = useKnownRevFolder(projectId, 'history');
  const [busy, setBusy] = useState(false);
  // What the files of this run linked, read when the last one settles; and whether a run is going.
  const results = useRef<Added[]>([]);
  const running = useRef(false);
  const mine = (folderId: string) => folderId === pictures || folderId === history;
  const active = queue.items.some((i) => mine(i.folderId) && (i.status === 'queued' || i.status === 'uploading'));

  useEffect(() => {
    if (active) {
      running.current = true;
      return;
    }
    if (!running.current) return;
    running.current = false;
    const done = results.current.splice(0);
    if (done.length === 0) return;
    toast.show({ message: addedLine(done) });
    void qc.invalidateQueries({ queryKey: qk.revs(projectId) });
  }, [active, toast, qc, projectId]);

  const linkNow: AfterUpload = async (fileId, file) => {
    const r = await linkRevFile(projectId, fileId);
    results.current.push({ name: file.name, ...r });
    return r.rooms + r.signoffs > 0 ? 'Linked' : 'Not matched';
  };

  return {
    busy,
    /** The folders of this session's uploads (their lines show under the buttons). */
    folders: [pictures, history].filter((x): x is string => x !== null),
    add: (files: File[]) => {
      const pics = files.filter((f) => PICTURE.test(f.type));
      const pdfs = files.filter(isPdf);
      const other = files.filter((f) => !pics.includes(f) && !pdfs.includes(f)).map((f) => f.name);
      if (other.length > 0) toast.show({ tone: 'error', message: `Not added: ${other.join(', ')}. Pictures (JPG, PNG) and PDFs only.` });
      if (pics.length + pdfs.length === 0) return;
      setBusy(true);
      Promise.all([
        pics.length > 0 ? revFolder(qc, projectId, 'pictures') : null,
        pdfs.length > 0 ? revFolder(qc, projectId, 'history') : null,
      ])
        .then(([pf, hf]) => {
          if (pf !== null) queue.enqueue(pics, projectId, pf, linkNow);
          if (hf !== null) queue.enqueue(pdfs, projectId, hf, linkNow);
        })
        .catch((e: unknown) => {
          toast.show({ tone: 'error', message: messageOf(e) });
        })
        .finally(() => {
          setBusy(false);
        });
    },
  };
}
