// The wall's callout at the top of its page: the name big ("Electrical 0242 / IDF 0240"), the grid or room in brackets
// beside it, the level, the list and its phase small with the plan sheet (a tap opens the plan at this wall, the one
// place a sheet opens; Download beside it saves the sheet, through the same gate), and the tally; on a desktop, where
// the wall is on the plan beside it (`side`). A manager's Rename / Remove sit with the name (`manage`).
import type { ReactNode } from 'react';
import { FileText } from 'lucide-react';
import type { RevArea, RevList } from '../../data/revs.types';
import { usePlanSheetUrl } from '../../data/sheetUrl';
import { Icon } from '../../ui/Icon';
import { PlanDownload } from './plan/PlanDownload';
import { calloutOf, type WallCount } from './wallPage';
import { WallProgress } from './WallProgress';

interface WallHeaderProps {
  projectId: string;
  area: RevArea;
  list: RevList | undefined;
  count: WallCount;
  /** Right of the name: the Request button (desktop). */
  action?: ReactNode;
  /** Right of the whole callout: the wall on the plan (desktop). */
  side?: ReactNode;
  /** The plan at this wall. */
  onShowSheet: () => void;
  /** A manager's Rename / Remove. */
  manage?: ReactNode;
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

export function WallHeader({ projectId, area, list, count, action, side, onShowSheet, manage }: WallHeaderProps) {
  const { title, sub } = calloutOf(area.name);
  const meta = [area.level.trim(), list?.name, list?.phase].filter((x): x is string => Boolean(x));
  return (
    <header className="flex items-start gap-5">
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] font-medium text-ink-2">
          <span data-testid="rev-wall-level">{meta.join(' · ')}</span>
          {area.sheet_file_id ? (
            <span className="flex min-w-0 items-start gap-2">
              <span className="hidden text-ink-3 sm:inline">·</span>
              <SheetLink projectId={projectId} fileId={area.sheet_file_id} onShow={onShowSheet} />
            </span>
          ) : null}
        </div>
        <div className="flex items-start gap-3">
          <h1 className="min-w-0 flex-1 break-words text-[24px] font-semibold leading-8 tracking-[-0.015em] text-ink" data-testid="rev-wall-name">
            {title}
            {sub ? (
              <>
                {' '}
                <span className="ml-1 inline-block text-[17px] font-medium tracking-normal text-ink-2">{sub}</span>
              </>
            ) : null}
          </h1>
          {manage}
          {action}
        </div>
        <WallProgress count={count} withLine testId="rev-wall-progress" />
      </div>
      {side}
    </header>
  );
}
