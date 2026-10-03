// Approved / Not approved: records the result only (silent), changeable, with a one-tap "No issues" note and photos.
// Every save sends the whole result (result, note, photos), each carrying the version the last save left. An OFS
// request with walls is decided wall by wall instead (RevResults: the result and its note follow from them); its photos
// are kept here as on any request.
import { useState } from 'react';
import { messageOf } from '../../data/errors';
import { useSetResult, type ResultInput } from '../../data/inspections.decide';
import type { IrUpload } from '../../data/inspections.mutations';
import type { IrRequest } from '../../data/inspections.types';
import type { IrRevItem } from '../../data/revs.types';
import { Button } from '../../ui/Button';
import { useToast } from '../../ui/Toast';
import { AttachmentsField } from './AttachmentsField';
import { ChoiceRow } from './ChoiceRow';
import { RevResults } from './RevResults';

const RESULTS = [
  { value: 'approved', label: 'Approved' },
  { value: 'not_approved', label: 'Not approved' },
] as const;
type Result = (typeof RESULTS)[number]['value'];

const NO_ISSUES = 'No issues';

function resultOf(v: string | null): Result | null {
  return RESULTS.find((r) => r.value === v)?.value ?? null;
}

interface ResultStepProps {
  row: IrRequest;
  /** An OFS request's walls and items (null for any other request). */
  revs: readonly IrRevItem[] | null;
}

export function ResultStep({ row, revs }: ResultStepProps) {
  const set = useSetResult();
  const toast = useToast();
  const [note, setNote] = useState(row.result_note ?? '');
  const result = resultOf(row.result);
  const photos: IrUpload[] = row.result_photo_ids.map((id, i) => ({ id, name: `Photo ${String(i + 1)}` }));

  function save(patch: Partial<Omit<ResultInput, 'row'>>) {
    // Walls decide an OFS request's result and its note: photos keep them as the database has them.
    const current = revs !== null ? row.result_note : note;
    set.mutate(
      { row, result, note: current, photoIds: row.result_photo_ids, ...patch },
      {
        onError: (e) => {
          toast.show({ tone: 'error', message: `Result not saved: ${messageOf(e)}` });
        },
      },
    );
  }

  if (row.status === 'postponed') return null;
  return (
    <div className="flex flex-col gap-2" data-testid="ir-result-step">
      {revs !== null ? (
        <RevResults row={row} cells={revs} />
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <ChoiceRow
              label="Result"
              options={RESULTS}
              value={result}
              disabled={set.isPending}
              testId="ir-result"
              onPick={(v) => {
                save({ result: v === result ? null : v });
              }}
            />
            <Button
              size="sm"
              variant="quiet"
              disabled={set.isPending}
              data-testid="ir-no-issues"
              onClick={() => {
                setNote(NO_ISSUES);
                save({ result: result ?? 'approved', note: NO_ISSUES });
              }}
            >
              No issues
            </Button>
          </div>
          <label className="flex flex-col gap-1 text-xs font-medium text-ink-2">
            Note
            <textarea
              rows={3}
              className="rounded-md border border-line bg-card px-2.5 py-2 text-sm font-normal text-ink outline-none focus:border-accent"
              value={note}
              data-testid="ir-result-note"
              onChange={(e) => {
                setNote(e.target.value);
              }}
              onBlur={() => {
                if (note.trim() !== (row.result_note ?? '')) save({ note });
              }}
            />
          </label>
        </>
      )}
      <AttachmentsField
        projectId={row.project_id}
        label="Photos"
        photosOnly
        requestId={row.id}
        files={photos}
        onChange={(files) => {
          save({ photoIds: files.map((f) => f.id) });
        }}
      />
    </div>
  );
}
