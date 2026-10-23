// The wall's details, quiet, under its drawing and items (Jesse, Oct 23: the 3-D wall front and center, the rest
// below): the level, the list and its phase with the plan sheet (a tap opens the plan at this wall, the one place a
// sheet opens; Download beside it saves the sheet, through the same gate), its details (0082) in one short line (tag ·
// rating · UL · fire area · sheet), a neutral Check chip that shows what still needs checking against the plans, and
// where the wall is (its room's picture, the plan: `side`).
import { useState, type ReactNode } from 'react';
import { FileText } from 'lucide-react';
import type { RevArea, RevList } from '../../data/revs.types';
import { usePlanSheetUrl } from '../../data/sheetUrl';
import { Icon } from '../../ui/Icon';
import { PlanDownload } from './plan/PlanDownload';
import { detailsLine } from './model';

interface WallInfoProps {
  projectId: string;
  area: RevArea;
  list: RevList | undefined;
  /** Where the wall is: its room's picture and the plan. */
  side: ReactNode;
  /** The plan at this wall. */
  onShowSheet: () => void;
}

interface SheetLinkProps {
  projectId: string;
  fileId: string;
  onShow: () => void;
}

/** The sheet's name (through Revs' gate: a reader who can't open Files still sees it) and its Download. */
function SheetLink({ projectId, fileId, onShow }: SheetLinkProps) {
  const url = usePlanSheetUrl(projectId, fileId);
  const name = url.data ? (url.data.name ?? 'Plan sheet') : url.isError ? 'Plan sheet' : null;
  if (name === null) return null;
  return (
    <span className="flex min-w-0 items-center gap-1">
      <button
        type="button"
        className="inline-flex min-w-0 items-start gap-1 text-left text-accent hover:underline"
        data-testid="rev-wall-sheet"
        onClick={onShow}
      >
        <Icon icon={FileText} size={14} className="mt-[3px] shrink-0" />
        <span className="break-words">{name}</span>
      </button>
      <PlanDownload projectId={projectId} fileId={fileId} name={name} testId="rev-wall-sheet-download" />
    </span>
  );
}

/** What still needs checking: a neutral chip; a tap shows the note beside it. */
function CheckNote({ note }: { note: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        aria-expanded={open}
        className="inline-flex h-6 shrink-0 items-center rounded-full border border-line-strong bg-card px-2.5 text-[12px] font-medium text-ink-2 hover:bg-page"
        data-testid="rev-wall-check"
        onClick={() => {
          setOpen(!open);
        }}
      >
        Check
      </button>
      {open ? (
        <span className="min-w-0 basis-full break-words text-ink" data-testid="rev-wall-check-note">
          {note}
        </span>
      ) : null}
    </>
  );
}

export function WallInfo({ projectId, area, list, side, onShowSheet }: WallInfoProps) {
  const meta = [area.level.trim(), list?.name, list?.phase].filter((x): x is string => Boolean(x));
  const details = detailsLine(area);
  return (
    <section className="flex flex-col gap-3 border-t border-line pt-3" data-testid="rev-wall-info">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] font-medium text-ink-2">
        <span data-testid="rev-wall-level">{meta.join(' · ')}</span>
        {area.sheet_file_id ? (
          <span className="flex min-w-0 items-start gap-2">
            <span className="hidden text-ink-3 sm:inline">·</span>
            <SheetLink projectId={projectId} fileId={area.sheet_file_id} onShow={onShowSheet} />
          </span>
        ) : null}
      </div>
      {details !== null || area.check_note ? (
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[13.5px] leading-5 text-ink-2">
          {details !== null ? <span data-testid="rev-wall-details">{details}</span> : null}
          {area.check_note ? <CheckNote key={area.check_note} note={area.check_note} /> : null}
        </div>
      ) : null}
      {side}
    </section>
  );
}
