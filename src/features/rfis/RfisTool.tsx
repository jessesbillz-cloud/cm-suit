// RFIs (the Sep 28 contract, SPEC §7.4, §14.1; the log's route strip, Sep 30): the log in the main area with one big
// "New RFI" button; the new form and each RFI open in the right column (full screen on the phone) so the log stays in
// view. Open / Mine / All and one search box (a number + Enter opens that RFI). One order: what waits on me first, then
// anything late, then anything due, then the newest.
import type { ReactNode } from 'react';
import { Plus } from 'lucide-react';
import { useUser } from '../../data/auth';
import { useProject } from '../../data/queries';
import { useRfiList, useRfiProgress } from '../../data/rfis.queries';
import { Button } from '../../ui/Button';
import { Card } from '../../ui/Card';
import { PageHeader } from '../../ui/PageHeader';
import { SearchBox } from '../../ui/SearchBox';
import { Segments } from '../../ui/Segments';
import { EmptyState, ErrorState, LoadingState } from '../../ui/States';
import { TOOL_META } from '../../ui/tools';
import { FILTERS, NEW_ITEM, logSummary, openTarget, visibleRows, type Filter } from './model';
import { stripsByRfi } from './progress';
import { RfiLog } from './RfiLog';
import { useRfiCaps } from './useRfiCaps';
import { useRfisNav } from './useRfisNav';

interface RfisToolProps {
  projectId: string;
  itemId: string | null;
  isPhone: boolean;
}

const EMPTY_FILTER: Record<Filter, string> = {
  open: 'No open RFIs.',
  mine: 'None of yours.',
  all: 'No RFIs yet.',
};

const META = TOOL_META.rfis;

interface FrameProps {
  meta?: string | undefined;
  actions?: ReactNode;
  below?: ReactNode;
  children: ReactNode;
}

function Frame({ meta, actions, below, children }: FrameProps) {
  return (
    <div className="mx-auto flex max-w-5xl flex-col">
      <PageHeader title={META.label} icon={META.icon} meta={meta} actions={actions} below={below} />
      {children}
    </div>
  );
}

export function RfisTool({ projectId, itemId, isPhone }: RfisToolProps) {
  const user = useUser();
  const nav = useRfisNav(projectId, itemId);
  const { caps, error, retry } = useRfiCaps(projectId);
  const list = useRfiList(projectId);
  const progress = useRfiProgress(projectId);
  const project = useProject(projectId);

  if (error) return <Frame><ErrorState error={error} onRetry={retry} /></Frame>;
  if (project.isError) return <Frame><ErrorState error={project.error} onRetry={() => void project.refetch()} /></Frame>;
  if (!caps || project.isPending) return <Frame><Card><LoadingState label="Loading RFIs" /></Card></Frame>;

  const now = new Date();
  const tz = project.data.timezone;
  const rows = list.data ?? [];
  const view = { filter: nav.filter, query: nav.query, userId: user.id };
  const strips = progress.data ? stripsByRfi(progress.data) : undefined;
  const visible = visibleRows(rows, view, now);
  const open = () => {
    nav.open(NEW_ITEM);
  };
  const newButton = caps.create ? (
    <Button variant="primary" icon={Plus} data-testid="rfi-new" onClick={open}>
      New RFI
    </Button>
  ) : undefined;
  const filters =
    rows.length > 0 ? (
      <div className="flex flex-wrap items-center gap-2">
        <Segments kind="radio" label="Show" options={FILTERS} value={nav.filter} onPick={nav.setFilter} testId="rfi-filter" />
        <SearchBox
          label="Search RFIs"
          placeholder="Number or title"
          initial={nav.query}
          testId="rfi-search"
          className="flex-1"
          onChange={nav.setQuery}
          onEnter={(q) => {
            const target = openTarget(rows, visibleRows(rows, { ...view, query: q }, now), q);
            if (target) nav.open(target.id);
          }}
        />
      </div>
    ) : undefined;

  return (
    <Frame meta={rows.length > 0 ? logSummary(rows, tz, now) : undefined} actions={newButton} below={filters}>
      <Card padded={false} className="overflow-hidden">
        {list.isPending ? <LoadingState label="Loading RFIs" /> : null}
        {list.isError ? <ErrorState error={list.error} onRetry={() => void list.refetch()} /> : null}
        {list.isSuccess && progress.isError ? <ErrorState error={progress.error} onRetry={() => void progress.refetch()} /> : null}
        {list.isSuccess && rows.length === 0 ? (
          <EmptyState
            icon={META.icon}
            title="No RFIs yet."
            action={
              caps.create ? (
                <Button variant="primary" icon={Plus} onClick={open}>
                  New RFI
                </Button>
              ) : undefined
            }
          />
        ) : null}
        {rows.length > 0 && visible.length === 0 ? (
          <p className="px-4 py-12 text-center text-sm text-ink-2" data-testid="rfi-none">
            {nav.query.trim() === '' ? EMPTY_FILTER[nav.filter] : 'Nothing matches.'}
          </p>
        ) : null}
        {visible.length > 0 ? (
          <RfiLog rows={visible} strips={strips} timeZone={tz} now={now} selectedId={itemId} onOpen={nav.open} isPhone={isPhone} />
        ) : null}
      </Card>
    </Frame>
  );
}
