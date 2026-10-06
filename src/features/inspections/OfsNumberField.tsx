// The OFS number (0091): the one number a person types. Prefilled with the number the database gave the request (one
// after the job's highest), editable by whoever sends OFS requests until the IR is signed, saved on blur or Enter
// with the version check. The database keeps it unique on the job.
import { useState } from 'react';
import { messageOf } from '../../data/errors';
import { useOfsNumber } from '../../data/inspections.ofs';
import type { IrRequest } from '../../data/inspections.types';
import { FIELD_CONTROL, FIELD_LABEL } from '../../ui/Fields';

export function OfsNumberField({ row }: { row: IrRequest }) {
  const save = useOfsNumber();
  const [text, setText] = useState(row.ofs_number === null ? '' : String(row.ofs_number));
  const [problem, setProblem] = useState<string | null>(null);

  function commit() {
    const n = Number(text.trim());
    if (text.trim() === '' || !Number.isInteger(n) || n < 1 || n > 999999) {
      setProblem('Type a number from 1 to 999999.');
      return;
    }
    setProblem(null);
    if (n === row.ofs_number) return;
    save.mutate(
      { row, number: n },
      {
        onError: (e) => {
          setProblem(messageOf(e));
        },
      },
    );
  }

  return (
    <div className="flex flex-col gap-1">
      <label className={`${FIELD_LABEL} w-32`}>
        OFS #
        <input
          className={FIELD_CONTROL}
          inputMode="numeric"
          value={text}
          data-testid="ofs-number"
          onChange={(e) => {
            setText(e.target.value.replace(/[^0-9]/g, ''));
          }}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              commit();
            }
          }}
        />
      </label>
      {problem ? (
        <p className="text-sm text-danger" data-testid="ofs-number-problem">
          {problem}
        </p>
      ) : null}
    </div>
  );
}
