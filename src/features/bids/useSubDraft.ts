// The sub pane's state: the draft as typed, the last saved row (its version is what the next save checks), and one
// write at a time. A blur while a write is running saves again right after it, from the newest draft and version, so
// quick edits never trip the version check on each other. Refs hold the newest values for callbacks (undo, a finished
// save) created on an earlier render.
import { useRef, useState } from 'react';
import { messageOf } from '../../data/errors';
import { useRecordCslbCheck, useSaveSub } from '../../data/subs.mutations';
import type { CslbResult, SubRow } from '../../data/subs.types';
import { draftPatch, toDraft, type SubDraft } from './subs';

export function useSubDraft(row: SubRow) {
  const save = useSaveSub();
  const check = useRecordCslbCheck();
  const [base, setBaseState] = useState(row);
  const [draft, setDraftState] = useState(() => toDraft(row));
  const [problem, setProblem] = useState<string | null>(null);
  const latestBase = useRef(row);
  const latestDraft = useRef(draft);
  const busy = useRef(false);
  const again = useRef(false);

  function setBase(next: SubRow) {
    latestBase.current = next;
    setBaseState(next);
  }

  /** Changes the draft (not saved until commit). */
  function edit(change: Partial<SubDraft>) {
    const next = { ...latestDraft.current, ...change };
    latestDraft.current = next;
    setDraftState(next);
  }

  const nextCheck = useRef<CslbResult | null>(null);

  const settle = () => {
    busy.current = false;
    if (again.current) {
      again.current = false;
      if (write()) return;
    }
    const status = nextCheck.current;
    if (status !== null) {
      nextCheck.current = null;
      runCheck(status);
    }
  };
  const fail = (e: Error) => {
    again.current = false;
    nextCheck.current = null;
    setProblem(messageOf(e));
  };

  /** Starts a save when something changed; true when one started (a queued CSLB result then waits for it). */
  function write(): boolean {
    const { patch, problem: invalid } = draftPatch(latestDraft.current, latestBase.current);
    setProblem(invalid);
    if (invalid !== null || patch === null) return false;
    busy.current = true;
    save.mutate({ row: latestBase.current, patch }, { onSuccess: setBase, onError: fail, onSettled: settle });
    return true;
  }

  /** Saves what changed (on blur). */
  function commit() {
    if (busy.current) {
      again.current = true;
      return;
    }
    write();
  }

  function runCheck(status: CslbResult) {
    busy.current = true;
    setProblem(null);
    check.mutate({ row: latestBase.current, status }, { onSuccess: setBase, onError: fail, onSettled: settle });
  }

  /** Records a CSLB lookup result (after a save still running, e.g. the number's blur); the server stamps the time. */
  function record(status: CslbResult) {
    if (busy.current) {
      nextCheck.current = status;
      return;
    }
    runCheck(status);
  }

  return {
    base,
    draft,
    edit,
    commit,
    record,
    problem,
    pending: save.isPending || check.isPending,
    saved: save.isSuccess || check.isSuccess,
  };
}
