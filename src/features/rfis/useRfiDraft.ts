// The RFI form's state and autosave: the first save (once there is a title and a question) creates the draft with the
// form's key (a repeat returns the same draft); later saves carry the version. Saves run one at a time, about a second
// after typing stops, when a photo finishes uploading, when the app goes to the background and when the form closes.
// A version conflict stops saving and says so: nothing is overwritten. flush() is what Sign & send waits for.
import { useCallback, useEffect, useRef, useState } from 'react';
import { DataError, messageOf } from '../../data/errors';
import { useCreateRfi, useRfiUpload, useUpdateRfi } from '../../data/rfis.mutations';
import { RFI_PHOTO_LIMIT, type RfiRow } from '../../data/rfis.types';
import { usePhotoUploads } from '../corrections/usePhotoUploads';
import { fieldsOf, formOf, missingText, type DraftForm } from './draft';

const SAVE_AFTER_MS = 900;

type Status = 'saved' | 'dirty' | 'saving' | 'error';

/** A save's outcome: the saved row (null before the first save) or what stopped it. Never rejects. */
interface Flushed {
  row: RfiRow | null;
  problem: string | null;
}

export function useRfiDraft(projectId: string, initial: RfiRow | null) {
  const { mutateAsync: createRfi } = useCreateRfi();
  const { mutateAsync: updateRfi } = useUpdateRfi();
  const [key] = useState(() => crypto.randomUUID());
  const [form, setForm] = useState<DraftForm>(() => formOf(initial));
  const photos = usePhotoUploads(projectId, Math.max(0, RFI_PHOTO_LIMIT - form.kept.length), useRfiUpload());
  const [status, setStatus] = useState<Status>('saved');
  const [problem, setProblem] = useState<string | null>(null);
  const [savedOnce, setSavedOnce] = useState(false);
  const saved = useRef<RfiRow | null>(initial);
  const latest = useRef<DraftForm>(form);
  const uploaded = useRef<string[]>([]);
  const edits = useRef(0);
  const savedEdits = useRef(0);
  const stopped = useRef(false);
  const chain = useRef<Promise<Flushed>>(Promise.resolve({ row: initial, problem: null }));
  const timer = useRef<number | null>(null);

  const run = useCallback(async (): Promise<Flushed> => {
    if (stopped.current) return { row: saved.current, problem: 'Changed by someone else. Reload to see it.' };
    if (edits.current === savedEdits.current) return { row: saved.current, problem: null };
    const fields = fieldsOf(latest.current, uploaded.current);
    const missing = missingText(fields);
    if (missing !== null) return { row: saved.current, problem: missing };
    const upTo = edits.current;
    setStatus('saving');
    try {
      const was = saved.current;
      const row = was === null ? await createRfi({ projectId, key, ...fields }) : await updateRfi({ ref: was, fields });
      saved.current = row;
      savedEdits.current = upTo;
      setProblem(null);
      setSavedOnce(true);
      setStatus(edits.current === upTo ? 'saved' : 'dirty');
      return { row, problem: null };
    } catch (e) {
      const conflict = e instanceof DataError && e.code === '40001';
      if (conflict) stopped.current = true;
      const said = conflict ? 'Changed by someone else. Reload to see it.' : messageOf(e);
      setStatus('error');
      setProblem(said);
      return { row: saved.current, problem: said };
    }
  }, [createRfi, updateRfi, projectId, key]);

  /** Saves now what is typed, after any save already running. */
  const flush = useCallback((): Promise<Flushed> => {
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = null;
    const next = chain.current.then(run);
    chain.current = next;
    return next;
  }, [run]);

  const schedule = useCallback(
    (ms: number) => {
      if (timer.current !== null) window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => void flush(), ms);
    },
    [flush],
  );

  const edit = useCallback(
    (patch: Partial<DraftForm>) => {
      const next = { ...latest.current, ...patch };
      latest.current = next;
      edits.current += 1;
      setForm(next);
      setStatus('dirty');
      schedule(SAVE_AFTER_MS);
    },
    [schedule],
  );

  // A finished (or removed) upload changes the photos: save them with the RFI.
  const idsKey = photos.ids.join(',');
  useEffect(() => {
    const ids = idsKey === '' ? [] : idsKey.split(',');
    if (ids.join(',') === uploaded.current.join(',')) return;
    uploaded.current = ids;
    edits.current += 1;
    setStatus('dirty');
    schedule(0);
  }, [idsKey, schedule]);

  useEffect(() => {
    const onHidden = () => {
      if (document.visibilityState === 'hidden') void flush();
    };
    const onLeave = () => {
      void flush();
    };
    document.addEventListener('visibilitychange', onHidden);
    window.addEventListener('pagehide', onLeave);
    return () => {
      document.removeEventListener('visibilitychange', onHidden);
      window.removeEventListener('pagehide', onLeave);
      void flush();
    };
  }, [flush]);

  return {
    form,
    edit,
    photos,
    flush,
    problem,
    saving: status === 'saving',
    /** "Saved" shows only after something was saved here and nothing is waiting. */
    justSaved: savedOnce && status === 'saved',
  };
}

export type RfiDraft = ReturnType<typeof useRfiDraft>;
