// The deputy's result on an OFS request with walls (Jesse, Oct 22: "an easy sign-off"): what is still on the request as
// big boxes, every one Pass to start with, and one Pass all. A tap flips a box to Fail, which asks for one line on why
// (OSFM: not just a red circle); the button then saves them all (ir_rev_results) and the request's result follows:
// approved when all passed. Saving and Clear come with Undo, never a question.
import { useState } from 'react';
import { CheckCheck, Eraser } from 'lucide-react';
import { messageOf } from '../../data/errors';
import type { IrRef } from '../../data/inspections.mutations';
import type { IrRequest } from '../../data/inspections.types';
import { useSetRevResults } from '../../data/revs.mutations';
import type { IrRevItem, RevResult, RevSetup } from '../../data/revs.types';
import { Button } from '../../ui/Button';
import { FIELD_CONTROL } from '../../ui/Fields';
import { useToast } from '../../ui/Toast';
import { StateBox } from '../revs/StateBox';
import { CellGroupCard, LevelLine, WithSetup } from './RevCells';
import {
  cellGroups, cellKey, draftOf, draftToSave, failedCount, flip, missingReasons, savedResults, settle, type CellDraft, type Edits,
} from './revCells';

const NOTE_MISSING = FIELD_CONTROL.replace('border-line-strong', 'border-danger');

interface BodyProps {
  row: IrRequest;
  cells: readonly IrRevItem[];
  setup: RevSetup;
}

function RevResultsBody({ row, cells, setup }: BodyProps) {
  const set = useSetRevResults();
  const toast = useToast();
  const [edits, setEdits] = useState<Edits>({});
  const saved = savedResults(cells);
  const failed = failedCount(cells, edits);
  const missing = missingReasons(cells, edits);
  const toSave = draftToSave(cells, edits);

  function save(ref: IrRef, results: RevResult[] | null, undo?: { message: string; back: RevResult[] | null }) {
    set.mutate(
      { row: ref, results },
      {
        onSuccess: (next) => {
          setEdits((cur) => settle(cur, results));
          if (!undo) return;
          toast.show({
            message: undo.message,
            action: {
              label: 'Undo',
              onClick: () => {
                save({ id: next.id, version: next.version, project_id: next.project_id }, undo.back);
              },
            },
          });
        },
        onError: (e) => {
          toast.show({ tone: 'error', message: `Result not saved: ${messageOf(e)}` });
        },
      },
    );
  }

  function edit(cell: IrRevItem, next: CellDraft) {
    setEdits((cur) => ({ ...cur, [cellKey(cell)]: next }));
  }

  return (
    <div className="flex flex-col gap-2.5" data-testid="rev-results">
      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant="primary"
          icon={CheckCheck}
          disabled={set.isPending || toSave === null}
          data-testid="rev-all-passed"
          onClick={() => {
            if (toSave !== null) save(row, toSave, { message: failed > 0 ? `Saved. ${String(failed)} failed.` : 'All passed.', back: saved });
          }}
        >
          {failed > 0 ? `Save · ${String(failed)} failed` : 'Pass all'}
        </Button>
        {saved !== null ? (
          <Button
            size="sm"
            variant="quiet"
            icon={Eraser}
            disabled={set.isPending}
            onClick={() => {
              save(row, null, { message: 'Results cleared.', back: saved });
            }}
          >
            Clear
          </Button>
        ) : null}
        <span className="ml-auto text-xs text-ink-2" data-testid="rev-left" aria-live="polite">
          {set.isPending ? 'Saving' : missing > 0 ? 'Say why it failed' : ''}
        </span>
      </div>
      <LevelLine cells={cells} setup={setup} />
      {cellGroups(cells, setup).map((g) => (
        <CellGroupCard key={g.color} group={g}>
          <li className="flex flex-wrap gap-2 px-3 py-2.5">
            {g.rows.map(({ cell, label }) => {
              const draft = draftOf(cell, edits);
              return (
                <StateBox
                  key={cell.id}
                  state={draft.result}
                  label={label}
                  name={`${label}: ${draft.result === 'passed' ? 'Pass' : 'Fail'}`}
                  disabled={set.isPending}
                  testId={`rev-cell-${cell.area_id}-${cell.item_id}`}
                  onClick={() => {
                    edit(cell, flip(draft));
                  }}
                />
              );
            })}
          </li>
          {g.rows.map(({ cell, label }) => {
            const draft = draftOf(cell, edits);
            if (draft.result !== 'failed') return null;
            return (
              <li key={`${cell.id}-why`} className="flex flex-col gap-1 px-3 py-2">
                <span className="break-words text-[13px] font-medium text-ink-2">{label}</span>
                <input
                  type="text"
                  aria-label={`${label}: why it failed`}
                  placeholder="Why it failed"
                  maxLength={1000}
                  className={draft.note.trim() === '' ? NOTE_MISSING : FIELD_CONTROL}
                  value={draft.note}
                  data-testid={`rev-note-${cell.area_id}-${cell.item_id}`}
                  onChange={(e) => {
                    edit(cell, { ...draft, note: e.target.value });
                  }}
                />
              </li>
            );
          })}
        </CellGroupCard>
      ))}
    </div>
  );
}

export function RevResults({ row, cells }: { row: IrRequest; cells: readonly IrRevItem[] }) {
  return <WithSetup projectId={row.project_id}>{(setup) => <RevResultsBody row={row} cells={cells} setup={setup} />}</WithSetup>;
}
