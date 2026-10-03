// "What to inspect" on an OFS request of a job with revs: the walls and items (RevPicker), then the sheet the map starts
// on: the first picked wall's, or one picked from the job's files. Walls on two sheets get a short note: one map shows
// one sheet (OSFM).
import { useMemo } from 'react';
import type { RevSetup, RevStatusRow } from '../../data/revs.types';
import { RevPicker } from '../revs/RevPicker';
import { firstSheet, requestPlan, sheetCount, statusIndex, type RevPick } from '../revs/revPick';
import { SheetField } from './SheetField';

export interface OfsRevs {
  setup: RevSetup;
  status: RevStatusRow[];
  /** The pick to start from (the link's walls and items). */
  start: RevPick;
}

interface OfsFieldsProps {
  projectId: string;
  revs: OfsRevs;
  pick: RevPick;
  onPick: (next: RevPick) => void;
  /** A sheet picked by hand; null: the walls' own. */
  sheet: string | null;
  onSheet: (fileId: string) => void;
  date: string;
}

export function OfsFields({ projectId, revs, pick, onPick, sheet, onSheet, date }: OfsFieldsProps) {
  const index = useMemo(() => statusIndex(revs.status), [revs.status]);
  const { walls } = requestPlan(revs.setup, index, pick);
  const sheets = sheetCount(walls);
  return (
    <>
      <RevPicker setup={revs.setup} status={revs.status} value={pick} onChange={onPick} date={date} />
      {walls.length > 0 ? (
        <div className="flex flex-col gap-1">
          <SheetField projectId={projectId} value={sheet ?? firstSheet(walls)} onChange={onSheet} />
          {sheet === null && sheets > 1 ? (
            <p className="text-[13px] text-ink-2" data-testid="rev-sheets-note">
              Walls on {sheets} sheets. The map shows one.
            </p>
          ) : null}
        </div>
      ) : null}
    </>
  );
}
