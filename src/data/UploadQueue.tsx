// The upload queue: per-file progress that survives route changes (it sits above the router).
// React state + refs only; no module-level state (CLAUDE.md rule 10).
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useSession } from './auth';
import { messageOf } from './errors';
import { qk } from './keys';
import { isAbortError, uploadFile } from './upload';

const MAX_PARALLEL = 3;

export interface UploadItem {
  key: number;
  name: string;
  size: number;
  loaded: number;
  status: 'queued' | 'uploading' | 'done' | 'failed' | 'cancelled';
  error: string | null;
  /** What the after-upload step reported (e.g. "Received #12"); null when there was none. */
  note: string | null;
  projectId: string;
  folderId: string;
}

/**
 * Runs once the file is stored, before the item counts as done (e.g. record it as a received bid). Its failure fails
 * the item, and Retry runs the upload (resumed) and the step again. Returns the note to show on the line.
 */
export type AfterUpload = (fileId: string, file: File) => Promise<string | null>;

interface UploadQueueValue {
  items: UploadItem[];
  enqueue: (files: File[], projectId: string, folderId: string, afterUpload?: AfterUpload) => void;
  cancel: (key: number) => void;
  retry: (key: number) => void;
  clearFinished: () => void;
}

const UploadQueueContext = createContext<UploadQueueValue | null>(null);

export function useUploadQueue(): UploadQueueValue {
  const v = useContext(UploadQueueContext);
  if (!v) throw new Error('useUploadQueue must be used inside <UploadQueueProvider>');
  return v;
}

export function UploadQueueProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<UploadItem[]>([]);
  const files = useRef(new Map<number, File>());
  const afterUploads = useRef(new Map<number, AfterUpload>());
  const controllers = useRef(new Map<number, AbortController>());
  const nextKey = useRef(1);
  // Keys already handed to the uploader, so a re-render (or StrictMode's double effect) never starts one twice.
  const started = useRef(new Set<number>());
  const { user } = useSession();
  const qc = useQueryClient();

  const patch = useCallback((key: number, p: Partial<UploadItem>) => {
    setItems((list) => list.map((it) => (it.key === key ? { ...it, ...p } : it)));
  }, []);

  const start = useCallback(
    (item: UploadItem, userId: string) => {
      const file = files.current.get(item.key);
      if (!file) {
        patch(item.key, { status: 'failed', error: 'The file is no longer available. Pick it again.' });
        return;
      }
      const controller = new AbortController();
      controllers.current.set(item.key, controller);
      patch(item.key, { status: 'uploading', error: null });
      uploadFile({
        file,
        projectId: item.projectId,
        folderId: item.folderId,
        userId,
        signal: controller.signal,
        onProgress: (loaded) => {
          patch(item.key, { loaded });
        },
      })
        .then(async ({ fileId }) => {
          const after = afterUploads.current.get(item.key);
          const note = after ? await after(fileId, file) : null;
          patch(item.key, { status: 'done', loaded: item.size, note });
          files.current.delete(item.key);
          afterUploads.current.delete(item.key);
          await qc.invalidateQueries({ queryKey: qk.files(item.folderId) });
        })
        .catch((e: unknown) => {
          if (isAbortError(e)) patch(item.key, { status: 'cancelled' });
          else patch(item.key, { status: 'failed', error: messageOf(e) });
        })
        .finally(() => {
          controllers.current.delete(item.key);
        });
    },
    [patch, qc],
  );

  // Keep up to MAX_PARALLEL uploads running; the rest wait their turn.
  useEffect(() => {
    if (!user) return;
    const running = items.filter((i) => i.status === 'uploading').length;
    const waiting = items
      .filter((i) => i.status === 'queued' && !started.current.has(i.key))
      .slice(0, Math.max(0, MAX_PARALLEL - running));
    for (const item of waiting) {
      started.current.add(item.key);
      start(item, user.id);
    }
  }, [items, start, user]);

  const enqueue = useCallback((picked: File[], projectId: string, folderId: string, afterUpload?: AfterUpload) => {
    const added = picked.map((file): UploadItem => {
      const key = nextKey.current;
      nextKey.current += 1;
      files.current.set(key, file);
      if (afterUpload) afterUploads.current.set(key, afterUpload);
      return { key, name: file.name, size: file.size, loaded: 0, status: 'queued', error: null, note: null, projectId, folderId };
    });
    setItems((list) => [...list, ...added]);
  }, []);

  const cancel = useCallback(
    (key: number) => {
      const c = controllers.current.get(key);
      if (c) c.abort();
      else patch(key, { status: 'cancelled' });
    },
    [patch],
  );

  const retry = useCallback(
    (key: number) => {
      started.current.delete(key);
      patch(key, { status: 'queued', error: null });
    },
    [patch],
  );

  const clearFinished = useCallback(() => {
    setItems((list) => list.filter((i) => i.status === 'queued' || i.status === 'uploading' || i.status === 'failed'));
  }, []);

  const value = useMemo(() => ({ items, enqueue, cancel, retry, clearFinished }), [items, enqueue, cancel, retry, clearFinished]);
  return <UploadQueueContext.Provider value={value}>{children}</UploadQueueContext.Provider>;
}
