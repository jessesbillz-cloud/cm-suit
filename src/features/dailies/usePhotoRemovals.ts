// A report's photo removals with Undo (CLAUDE.md rule 16): a removed photo hides at once and is taken off the report
// when its toast closes, unless Undo is pressed. Submit flushes every pending removal first (and waits for it), so a
// photo removed a moment before signing never reaches the signed PDF; leaving the report or the page flushes them too,
// so a removal is never lost.
import { useCallback, useEffect, useRef, useState } from 'react';
import { useRemoveDailyPhoto } from '../../data/dailies.mutations';
import type { DailyPhotoRow } from '../../data/dailies.types';
import { messageOf } from '../../data/errors';
import { useToast } from '../../ui/Toast';

interface Pending {
  photo: DailyPhotoRow;
  toastId: number;
}

export function usePhotoRemovals(projectId: string) {
  const { mutateAsync } = useRemoveDailyPhoto(projectId);
  const toast = useToast();
  const [hidden, setHidden] = useState<string[]>([]);
  const pending = useRef(new Map<string, Pending>());

  const unhide = useCallback((id: string) => {
    setHidden((h) => h.filter((x) => x !== id));
  }, []);

  /** Takes one pending removal off the report now. Nothing to do when it was undone or already done. */
  const commit = useCallback(
    async (id: string): Promise<void> => {
      const p = pending.current.get(id);
      if (!p) return;
      pending.current.delete(id);
      try {
        // Settles once the photos are read again (the row now says removed): it no longer needs hiding.
        await mutateAsync(p.photo);
        unhide(id);
      } catch (e) {
        unhide(id);
        toast.show({ tone: 'error', message: `Photo not removed: ${messageOf(e)}` });
        throw e;
      }
    },
    [mutateAsync, toast, unhide],
  );

  /** Every pending removal, now; their toasts close without Undo. Rejects when one fails (the photo comes back). */
  const flush = useCallback(async (): Promise<void> => {
    const ids = [...pending.current.keys()];
    for (const id of ids) {
      const p = pending.current.get(id);
      if (p) toast.dismiss(p.toastId);
    }
    await Promise.all(ids.map((id) => commit(id)));
  }, [commit, toast]);

  const remove = useCallback(
    (photo: DailyPhotoRow) => {
      setHidden((h) => [...h, photo.id]);
      const toastId = toast.show({
        message: 'Photo removed.',
        action: {
          label: 'Undo',
          onClick: () => {
            pending.current.delete(photo.id);
            unhide(photo.id);
          },
        },
        // The toast closed on its own: the failure is already shown by commit.
        onCommit: () => {
          commit(photo.id).catch((e: unknown) => {
            console.warn('daily photo: not removed', e);
          });
        },
      });
      pending.current.set(photo.id, { photo, toastId });
    },
    [commit, toast, unhide],
  );

  // Leaving the report (or the page) takes pending removals off: they are never lost, and Undo goes with the screen.
  // Through a ref, so this runs on leaving only (never on a re-render, which would cut an Undo short).
  const flushRef = useRef(flush);
  useEffect(() => {
    flushRef.current = flush;
  }, [flush]);
  useEffect(() => {
    const onLeave = () => {
      flushRef.current().catch((e: unknown) => {
        console.warn('daily photo: not removed on leaving', e);
      });
    };
    window.addEventListener('pagehide', onLeave);
    return () => {
      window.removeEventListener('pagehide', onLeave);
      onLeave();
    };
  }, []);

  return { hidden, remove, flush };
}
