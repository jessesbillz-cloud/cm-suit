// "What to inspect" from the request link on a job with revs: the members' Revs picker (walls by level, up to three
// items with their map colors, the map title), then the sheet the map starts on: one of the picked walls' sheets (a
// visitor never browses the job's files), the first wall's unless another is picked. One sheet: nothing to pick.
import { useMemo } from 'react';
import type { PublicRevs } from '../../data/requestNoLogin.types';
import { FIELD_LABEL } from '../../ui/Fields';
import { RevPicker } from '../revs/RevPicker';
import { firstSheet, requestPlan, statusIndex, type RevPick } from '../revs/revPick';
import { ChoiceRow } from './ChoiceRow';
import { sheetOptions, sheetToSend, wallSheets } from './mapSheets';

interface PublicOfsFieldsProps {
  revs: PublicRevs;
  pick: RevPick;
  onPick: (next: RevPick) => void;
  /** A sheet picked by hand; null: the first wall's. */
  sheet: string | null;
  onSheet: (fileId: string) => void;
  /** yyyy-MM-dd: the request's day, for the map title. */
  date: string;
}

export function PublicOfsFields({ revs, pick, onPick, sheet, onSheet, date }: PublicOfsFieldsProps) {
  const index = useMemo(() => statusIndex(revs.status), [revs.status]);
  const { walls } = requestPlan(revs.setup, index, pick);
  const options = sheetOptions(wallSheets(walls));
  return (
    <>
      <RevPicker setup={revs.setup} status={revs.status} value={pick} onChange={onPick} date={date} />
      {options.length > 1 ? (
        <div className="flex flex-col gap-1.5">
          <span className={FIELD_LABEL}>Sheet</span>
          <ChoiceRow
            label="Sheet"
            options={options}
            value={sheetToSend(walls, sheet) ?? firstSheet(walls)}
            onPick={onSheet}
            testId="public-sheet"
            large
          />
        </div>
      ) : null}
    </>
  );
}
