// The report editor's state: the content as typed, the last saved version (what the next save checks) and one save at
// a time. Saves about 1 s after typing stops, when the app goes to the background, and again when the connection comes
// back. Saves go out in order (one at a time, always the newest content with the newest version). A version conflict
// stops saving and says so: nothing is ever overwritten. Until it is saved, the typed content is also kept on this device
// (localStorage "app:" key, cleared at sign-out), so closing the app while offline loses nothing.
import { useCallback, useEffect, useRef, useState } from 'react';
import { useSaveDailyContent } from '../../data/dailies.mutations';
import type { DailyReportRow } from '../../data/dailies.types';
import { DataError, messageOf } from '../../data/errors';
import { dailyContentSchema, type DailyContent } from '../../lib/dailies';

const SAVE_AFTER_MS = 1000;
const RETRY_MS = 5000;

type SaveStatus = 'saved' | 'dirty' | 'saving' | 'offline' | 'conflict' | 'error';

interface Stash {
  version: number;
  content: DailyContent;
}

function stashKey(reportId: string): string {
  return `app:daily-unsaved:${reportId}`;
}

function readStash(reportId: string): Stash | null {
  try {
    const raw = window.localStorage.getItem(stashKey(reportId));
    if (raw === null) return null;
    const v = JSON.parse(raw) as { version?: unknown; content?: unknown };
    const content = dailyContentSchema.safeParse(v.content);
    return typeof v.version === 'number' && content.success ? { version: v.version, content: content.data } : null;
  } catch (e) {
    console.warn('daily draft: the unsaved copy on this device could not be read', e);
    return null;
  }
}

function writeStash(reportId: string, stash: Stash | null): void {
  try {
    if (stash === null) window.localStorage.removeItem(stashKey(reportId));
    else window.localStorage.setItem(stashKey(reportId), JSON.stringify(stash));
  } catch (e) {
    console.warn('daily draft: this device would not keep an unsaved copy', e);
  }
}

interface Start {
  content: DailyContent;
  restored: boolean;
  problem: string | null;
}

/** What the editor starts from: the saved report, or this device's unsaved copy of that same version. */
function startFrom(report: DailyReportRow, saved: DailyContent): Start {
  const stash = readStash(report.id);
  if (stash === null) return { content: saved, restored: false, problem: null };
  if (stash.version === report.version) return { content: stash.content, restored: true, problem: null };
  writeStash(report.id, null);
  const same = JSON.stringify(stash.content) === JSON.stringify(saved);
  return { content: saved, restored: false, problem: same ? null : 'Changes on this device were older than the saved report. Not applied.' };
}

export function useReportDraft(projectId: string, report: DailyReportRow, saved: DailyContent) {
  const { mutateAsync } = useSaveDailyContent(projectId);
  const [start] = useState(() => startFrom(report, saved));
  const [content, setContent] = useState(start.content);
  const [status, setStatus] = useState<SaveStatus>(start.restored ? 'dirty' : 'saved');
  const [problem, setProblem] = useState<string | null>(start.problem);
  const [savedOnce, setSavedOnce] = useState(false);
  const version = useRef(report.version);
  const latest = useRef(start.content);
  const edits = useRef(start.restored ? 1 : 0);
  const savedEdits = useRef(0);
  const busy = useRef(false);
  const stopped = useRef(false);
  const timer = useRef<number | null>(null);

  const run = useCallback(async (): Promise<void> => {
    if (busy.current || stopped.current || edits.current === savedEdits.current) return;
    busy.current = true;
    const upTo = edits.current;
    setStatus('saving');
    let retryIn: number | null = null;
    try {
      const row = await mutateAsync({ reportId: report.id, version: version.current, content: latest.current });
      version.current = row.version;
      savedEdits.current = upTo;
      setProblem(null);
      setSavedOnce(true);
      if (edits.current === upTo) {
        writeStash(report.id, null);
        setStatus('saved');
      } else {
        writeStash(report.id, { version: row.version, content: latest.current });
        retryIn = 0;
      }
    } catch (e) {
      if (e instanceof DataError && e.code === '40001') {
        stopped.current = true;
        setStatus('conflict');
        setProblem('Changed on another device. Reload to see it.');
      } else if (!navigator.onLine) {
        setStatus('offline');
        setProblem('Offline. Saves when back online.');
        retryIn = RETRY_MS;
      } else {
        setStatus('error');
        setProblem(messageOf(e));
        retryIn = RETRY_MS;
      }
    } finally {
      busy.current = false;
    }
    if (retryIn !== null) {
      if (timer.current !== null) window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => void run(), retryIn);
    }
  }, [mutateAsync, report.id]);

  const schedule = useCallback(
    (ms: number) => {
      if (timer.current !== null) window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => void run(), ms);
    },
    [run],
  );

  /** Saves now what is typed (leaving the screen, the app going to the background, submitting). */
  const flush = useCallback(() => {
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = null;
    void run();
  }, [run]);

  /** Changes the content; it saves about a second after the last change. */
  const edit = useCallback(
    (change: (c: DailyContent) => DailyContent) => {
      if (stopped.current) return;
      const next = change(latest.current);
      if (next === latest.current) return; // nothing changed: nothing to save
      latest.current = next;
      edits.current += 1;
      setContent(next);
      setStatus('dirty');
      writeStash(report.id, { version: version.current, content: next });
      schedule(SAVE_AFTER_MS);
    },
    [report.id, schedule],
  );

  useEffect(() => {
    if (start.restored) schedule(0);
    const onHidden = () => {
      if (document.visibilityState === 'hidden') flush();
    };
    document.addEventListener('visibilitychange', onHidden);
    window.addEventListener('online', flush);
    window.addEventListener('pagehide', flush);
    return () => {
      document.removeEventListener('visibilitychange', onHidden);
      window.removeEventListener('online', flush);
      window.removeEventListener('pagehide', flush);
      flush();
    };
  }, [flush, schedule, start.restored]);

  return {
    content,
    edit,
    flush,
    status,
    problem,
    /** Everything typed is saved (submit waits for this). */
    settled: status === 'saved',
    /** "Saved" shows only after something was saved here. */
    justSaved: savedOnce && status === 'saved',
    /** The version the server has: what a submit signs. */
    savedVersion: () => version.current,
  };
}
