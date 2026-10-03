// A request map saves itself, for a member (ir_map_save) and a link visitor (map_save) alike: the caller hands in its
// save. Each change waits a moment for the next one, then saves; saves go one at a time, each carrying the version the
// last one left. A failure is loud (a toast, and a red line with Try again); someone else's change in between (a version
// miss) offers Reload instead. Leaving the screen doesn't drop a change: its timer still fires. Another sheet saves at
// once and starts on the page given (the page the request's walls are on, else 1); another page waits like a mark.
// Either clears the marks drawn on the old one, and Undo puts the sheet, the page and the marks back.
import { useEffect, useRef, useState } from 'react';
import { DataError, messageOf } from '../../data/errors';
import { FunctionError } from '../../data/functions';
import type { Stroke } from '../../lib/markup';
import { useToast } from '../../ui/Toast';
import type { Drawn, MapView, SaveMap } from './mapView';

const WAIT_MS = 600;

type Phase = 'idle' | 'waiting' | 'saving' | 'saved' | 'error';

interface Pending {
  /** The latest drawing not sent yet. */
  next: Drawn | null;
  running: boolean;
  timer: number | undefined;
  /** The map's version the next save carries. */
  version: number;
}

interface MapAutosave {
  /** What the map shows: my drawing while it saves, else the saved one. */
  drawn: Drawn;
  change: (strokes: Stroke[]) => void;
  setSheet: (fileId: string, page?: number) => void;
  setPage: (page: number) => void;
  /** A change waiting or saving. */
  busy: boolean;
  saved: boolean;
  problem: string | null;
  /** Try again, or Reload after someone else's change. */
  fix: { label: string; run: () => void } | null;
}

/** Someone else saved the map in between (the database's version miss; the link function answers it as 409). */
const isConflict = (e: unknown) => (e instanceof DataError && e.code === '40001') || (e instanceof FunctionError && e.status === 409);

export function useMapAutosave(view: MapView, save: SaveMap, reload: () => void): MapAutosave {
  const toast = useToast();
  const [draft, setDraft] = useState<Drawn | null>(null);
  const [phase, setPhase] = useState<Phase>('idle');
  const [error, setError] = useState<unknown>(null);
  const pending = useRef<Pending>({ next: null, running: false, timer: undefined, version: view.version });

  // Nothing waiting or saving: the next save carries the version the server has now.
  useEffect(() => {
    const p = pending.current;
    if (!p.running && p.next === null && p.timer === undefined) p.version = view.version;
  }, [view.version]);

  const drawn: Drawn = draft ?? { sheetFileId: view.sheetFileId, page: view.page, strokes: view.strokes };

  async function flush(): Promise<void> {
    const p = pending.current;
    window.clearTimeout(p.timer);
    p.timer = undefined;
    if (p.running) return;
    p.running = true;
    setPhase('saving');
    try {
      for (let next = p.next; next !== null; next = p.next) {
        p.next = null;
        p.version = await save({ ...next, version: p.version });
      }
      // Saved as drawn: the map's own (just updated) drawing is mine now.
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

  /** Shows `next` at once and saves it now or after the short wait. */
  function put(next: Drawn, now: boolean): void {
    const p = pending.current;
    setDraft(next);
    p.next = next;
    window.clearTimeout(p.timer);
    p.timer = undefined;
    if (now) {
      void flush();
      return;
    }
    setPhase('waiting');
    p.timer = window.setTimeout(() => {
      void flush();
    }, WAIT_MS);
  }

  /** Another sheet or page: the marks drawn on the old one mean nothing there. Undo brings all of it back. */
  function move(next: Drawn, now: boolean, message: string): void {
    const before = drawn;
    put(next, now);
    if (before.strokes.length === 0) return;
    toast.show({
      message,
      action: {
        label: 'Undo',
        onClick: () => {
          put(before, true);
        },
      },
    });
  }

  const busy = phase === 'waiting' || phase === 'saving';

  return {
    drawn,
    change: (strokes) => {
      put({ ...drawn, strokes }, false);
    },
    setSheet: (fileId, page = 1) => {
      if (fileId !== drawn.sheetFileId) move({ sheetFileId: fileId, page, strokes: [] }, true, 'Sheet changed. Marks cleared.');
    },
    setPage: (page) => {
      if (page !== drawn.page) move({ ...drawn, page, strokes: [] }, false, 'Page changed. Marks cleared.');
    },
    busy,
    saved: phase === 'saved',
    problem: phase === 'error' ? `Not saved. ${messageOf(error)}` : null,
    fix:
      phase !== 'error'
        ? null
        : isConflict(error)
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
                put(drawn, true);
              },
            },
  };
}
