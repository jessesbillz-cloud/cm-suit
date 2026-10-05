// Photos picked for a new item or a step: compressed (lib/compressPhoto) and uploaded at once (data/upload through
// the data layer), shown from the local file meanwhile. The save uses the ids of the finished ones. React state only.
// The caller passes its module's uploader (which folder the photos land in): corrections and RFIs share this hook.
// A file that is not an image (a PDF on an RFI answer) goes up as it is.
import { useCallback, useRef, useState } from 'react';
import { messageOf } from '../../data/errors';
import { compressPhoto, jpegName } from '../../lib/compressPhoto';

/** Uploads one file into the module's folder and resolves to its file id. */
type Uploader = (projectId: string, file: File, signal: AbortSignal) => Promise<string>;

export interface PickedPhoto {
  key: number;
  file: File;
  status: 'uploading' | 'done' | 'failed';
  fileId: string | null;
  error: string | null;
}

async function compress(f: File): Promise<File> {
  if (!f.type.startsWith('image/')) return f;
  return new File([await compressPhoto(f)], jpegName(f.name), { type: 'image/jpeg', lastModified: f.lastModified });
}

export function usePhotoUploads(projectId: string, limit: number, upload: Uploader) {
  const [photos, setPhotos] = useState<PickedPhoto[]>([]);
  const [problem, setProblem] = useState<string | null>(null);
  const nextKey = useRef(1);

  const patch = useCallback((key: number, p: Partial<PickedPhoto>) => {
    setPhotos((list) => list.map((x) => (x.key === key ? { ...x, ...p } : x)));
  }, []);

  const start = useCallback(
    (key: number, file: File) => {
      patch(key, { status: 'uploading', error: null });
      // Uploads finish even if the form closes: a photo is never half-stored.
      void upload(projectId, file, new AbortController().signal).then(
        (fileId) => {
          patch(key, { status: 'done', fileId });
        },
        (e: unknown) => {
          patch(key, { status: 'failed', error: messageOf(e) });
        },
      );
    },
    [patch, projectId, upload],
  );

  const count = photos.length;
  const add = useCallback(
    (picked: File[]) => {
      setProblem(null);
      const room = Math.max(0, limit - count);
      if (picked.length > room) setProblem(`Up to ${limit} photos.`);
      void Promise.all(picked.slice(0, room).map(compress)).then(
        (files) => {
          const added = files.map((file): PickedPhoto => {
            const key = nextKey.current;
            nextKey.current += 1;
            return { key, file, status: 'uploading', fileId: null, error: null };
          });
          setPhotos((list) => [...list, ...added]);
          for (const p of added) start(p.key, p.file);
        },
        (e: unknown) => {
          setProblem(`Photo not added: ${messageOf(e)}`);
        },
      );
    },
    [count, limit, start],
  );

  const remove = useCallback((key: number) => {
    setPhotos((list) => list.filter((x) => x.key !== key));
  }, []);

  const retry = useCallback(
    (key: number) => {
      const p = photos.find((x) => x.key === key);
      if (p) start(key, p.file);
    },
    [photos, start],
  );

  return {
    photos,
    problem,
    add,
    remove,
    retry,
    full: count >= limit,
    busy: photos.some((p) => p.status === 'uploading'),
    failed: photos.some((p) => p.status === 'failed'),
    ids: photos.flatMap((p) => (p.fileId !== null ? [p.fileId] : [])),
  };
}

export type PhotoUploads = ReturnType<typeof usePhotoUploads>;
