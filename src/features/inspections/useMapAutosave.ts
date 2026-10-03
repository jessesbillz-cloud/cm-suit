// A request map's marks save themselves (ir_map_save): each change waits a moment for the next stroke, then saves; saves
// go one at a time, each carrying the version the last one left. A failure is loud (a toast, and a red line with Try
// again); someone else's change in between (a version miss) offers Reload instead. Leaving the screen doesn't drop a
// change: its timer still fires. Picking another sheet saves at once and clears the marks drawn on the old one; Undo
// puts the sheet and the marks back.
import { useEffect, useRef, useState } from 'react';
import { DataError, messageOf } from '../../data/errors';
import { useSaveIrMap } from '../../data/revs.mutations';
import type { IrMapContext } from '../../data/revs.types';
import type { Stroke } from '../../lib/markup';
import { useToast } from '../../ui/Toast';

const WAIT_MS = 600;

type Phase = 'idle' | 'waiting' | 'saving' | 'saved' | 'error';

interface Pending {
  /** The latest marks not sent yet. */
  next: Stroke[] | null;
  running: boolean;
  timer: number | undefined;
  /** The map's version the next save carries. */
  version: number;
}

interface MapAutosave {
  /** What the sheet shows: my marks while they save, else the saved ones. */
  strokes: Stroke[];
  change: (strokes: Stroke[]) => void;
  setSheet: (fileId: string) => void;
  /** A change waiting or saving. */
  busy: boolean;
  saved: boolean;
  problem: string | null;
  /** Try again, or Reload after someone else's change. */
  fix: { label: string; run: () => void } | null;
}

const isConflict = (e: unknown) => e instanceof DataError && e.code === '40001';

export function useMapAutosave(ctx: IrMapContext, reload: () => void): MapAutosave {
  const save = useSaveIrMap();
  const toast = useToast();
  const [draft, setDraft] = useState<Stroke[] | null>(null);
  const [phase, setPhase] = useState<Phase>('idle');
  const [error, setError] = useState<unknown>(null);
  const pending = useRef<Pending>({ next: null, running: false, timer: undefined, version: ctx.version });
  const requestId = ctx.request_id;

  // Nothing waiting or saving: the next save carries the version the server has now.
  useEffect(() => {
    const p = pending.current;
    if (!p.running && p.next === null && p.timer === undefined) p.version = ctx.version;
  }, [ctx.version]);

  async function flush(): Promise<void> {
    const p = pending.current;
    window.clearTimeout(p.timer);
    p.timer = undefined;
    if (p.running) return;
    p.running = true;
    setPhase('saving');
    try {
      for (let strokes = p.next; strokes !== null; strokes = p.next) {
        p.next = null;
        const row = await save.mutateAsync({ requestId, version: p.version, strokes, sheetFileId: null, page: null });
        p.version = row.version;
      }
      // Saved as drawn: the map's own (just updated) marks are mine now.
      setDraft(null);
      setPhase('saved');
      setError(null);
    } catch (e) {
      setPhase('error');
      setError(e);
      toast.show({ tone: 'error', message: `Map not saved: ${messageOf(e)}` });
    } finally {
      p.running = false;
    }
  }

  function change(strokes: Stroke[]): void {
    const p = pending.current;
    setDraft(strokes);
    setPhase('waiting');
    p.next = strokes;
    window.clearTimeout(p.timer);
    p.timer = window.setTimeout(() => {
      void flush();
    }, WAIT_MS);
  }

  function putSheet(fileId: string, strokes: Stroke[], undo: { sheet: string; strokes: Stroke[] } | null): void {
    const p = pending.current;
    // Marks still waiting were drawn on the other sheet: the sheet's own marks replace them.
    window.clearTimeout(p.timer);
    p.timer = undefined;
    p.next = null;
    p.running = true;
    setPhase('saving');
    save.mutate(
      { requestId, version: p.version, strokes, sheetFileId: fileId, page: null },
      {
        onSuccess: (row) => {
          p.version = row.version;
          setDraft(null);
          setPhase('saved');
          setError(null);
          if (undo !== null) {
            toast.show({
              message: 'Sheet changed. Marks cleared.',
              action: {
                label: 'Undo',
                onClick: () => {
                  putSheet(undo.sheet, undo.strokes, null);
                },
              },
            });
          }
        },
        onError: (e) => {
          setPhase('error');
          setError(e);
          toast.show({ tone: 'error', message: `Sheet not changed: ${messageOf(e)}` });
        },
        onSettled: () => {
          p.running = false;
        },
      },
    );
  }

  const strokes = draft ?? ctx.strokes;
  const busy = phase === 'waiting' || phase === 'saving';
  const conflict = isConflict(error);

  return {
    strokes,
    change,
    // Marks drawn on another sheet mean nothing on this one; Undo brings the old sheet and its marks back.
    setSheet: (fileId) => {
      if (busy || fileId === ctx.sheet_file_id) return;
      const old = ctx.sheet_file_id;
      putSheet(fileId, [], old !== null && strokes.length > 0 ? { sheet: old, strokes } : null);
    },
    busy,
    saved: phase === 'saved',
    problem: phase === 'error' ? `Not saved. ${messageOf(error)}` : null,
    fix:
      phase !== 'error'
        ? null
        : conflict
          ? {
              label: 'Reload',
              run: () => {
                pending.current.next = null;
                setDraft(null);
                setPhase('idle');
                setError(null);
                reload();
              },
            }
          : {
              label: 'Try again',
              run: () => {
                pending.current.next = strokes;
                void flush();
              },
            },
  };
}
