// The wall's callout at the top of its page: the name big ("Electrical 0242 / IDF 0240"), the grid or room in brackets
// beside it, the level, the list and its phase small with the plan sheet (a tap opens it in Files), and the tally.
import type { ReactNode } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { FileText } from 'lucide-react';
import { useFile } from '../../data/queries';
import type { RevArea, RevList } from '../../data/revs.types';
import { Icon } from '../../ui/Icon';
import { calloutOf, type WallCount } from './wallPage';
import { WallProgress } from './WallProgress';

interface WallHeaderProps {
  projectId: string;
  area: RevArea;
  list: RevList | undefined;
  count: WallCount;
  /** Right of the name: the Request button (desktop). */
  action?: ReactNode;
}

function SheetLink({ projectId, fileId }: { projectId: string; fileId: string }) {
  const navigate = useNavigate();
  const file = useFile(fileId);
  if (!file.data) return null;
  return (
    <button
      type="button"
      className="inline-flex min-w-0 items-start gap-1 text-left text-accent hover:underline"
      data-testid="rev-wall-sheet"
      onClick={() => {
        void navigate({ to: '/p/$projectId/$tool/$itemId', params: { projectId, tool: 'files', itemId: fileId } });
      }}
    >
      <Icon icon={FileText} size={14} className="mt-[3px] shrink-0" />
      <span className="break-words">{file.data.original_name}</span>
    </button>
  );
}

export function WallHeader({ projectId, area, list, count, action }: WallHeaderProps) {
  const { title, sub } = calloutOf(area.name);
  const meta = [area.level.trim(), list?.name, list?.phase].filter((x): x is string => Boolean(x));
  return (
    <header className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] font-medium text-ink-2">
        <span data-testid="rev-wall-level">{meta.join(' · ')}</span>
        {area.sheet_file_id ? (
          <span className="flex min-w-0 items-start gap-2">
            <span className="hidden text-ink-3 sm:inline">·</span>
            <SheetLink projectId={projectId} fileId={area.sheet_file_id} />
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
        {action}
      </div>
      <WallProgress count={count} withLine testId="rev-wall-progress" />
    </header>
  );
}
