// Permits (0052): the log in the main area, by number, with one "New permit" button for the official; the new form and
// each permit open in the right column (full screen on the phone) so the log stays in view. On All my jobs (no job) it
// is the official's whole caseload, each row naming its job. Open / Issued / All.
import type { ReactNode } from 'react';
import { Plus } from 'lucide-react';
import { usePermitList, usePermitProgress } from '../../data/permits.queries';
import { useCapability } from '../../data/queries';
import { Button } from '../../ui/Button';
import { Card } from '../../ui/Card';
import { PageHeader } from '../../ui/PageHeader';
import { Segments } from '../../ui/Segments';
import { EmptyState, ErrorState, LoadingState } from '../../ui/States';
import { TOOL_META } from '../../ui/tools';
import { FILTERS, NEW_ITEM, byNumber, inFilter, logSummary, stepsByPermit, type Filter } from './model';
import { PermitLog } from './PermitLog';
import { usePermitsNav } from './usePermitsNav';

interface PermitsToolProps {
  /** null: All my jobs, the caseload. */
  projectId: string | null;
  itemId: string | null;
  isPhone: boolean;
}

const META = TOOL_META.permits;

const NONE: Record<Filter, string> = { open: 'No open permits.', issued: 'None issued.', all: 'No permits yet.' };

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

export function PermitsTool({ projectId, itemId, isPhone }: PermitsToolProps) {
  const nav = usePermitsNav(projectId, itemId);
  const read = useCapability(projectId, 'permits.read');
  const manage = useCapability(projectId, 'permits.manage');
  const list = usePermitList(projectId);
  const progress = usePermitProgress(projectId);

  const capError = [read, manage].find((q) => q.isError)?.error;
  if (capError) return <Frame><ErrorState error={capError} onRetry={() => { void read.refetch(); void manage.refetch(); }} /></Frame>;
  if (projectId !== null && (read.isPending || manage.isPending)) {
    return <Frame><Card><LoadingState label="Loading permits" /></Card></Frame>;
  }
  if (projectId !== null && read.data === false) {
    return <Frame><Card><EmptyState icon={META.icon} title="You can't see permits on this job." /></Card></Frame>;
  }

  const rows = [...(list.data ?? [])].sort(byNumber);
  const shown = rows.filter((r) => inFilter(r.stage, nav.filter));
  const canCreate = projectId !== null && manage.data === true;
  const open = () => {
    nav.open(NEW_ITEM);
  };
  const newButton = canCreate ? (
    <Button variant="primary" icon={Plus} data-testid="permit-new" onClick={open}>
      New permit
    </Button>
  ) : undefined;
  const filters =
    rows.length > 0 ? <Segments kind="radio" label="Show" options={FILTERS} value={nav.filter} onPick={nav.setFilter} testId="permit-filter" /> : undefined;

  return (
    <Frame meta={rows.length > 0 ? logSummary(rows) : undefined} actions={newButton} below={filters}>
      <Card padded={false} className="overflow-hidden">
        {list.isPending ? <LoadingState label="Loading permits" /> : null}
        {list.isError ? <ErrorState error={list.error} onRetry={() => void list.refetch()} /> : null}
        {list.isSuccess && progress.isError ? <ErrorState error={progress.error} onRetry={() => void progress.refetch()} /> : null}
        {list.isSuccess && rows.length === 0 ? (
          <EmptyState
            icon={META.icon}
            title="No permits yet."
            action={
              canCreate ? (
                <Button variant="primary" icon={Plus} onClick={open}>
                  New permit
                </Button>
              ) : undefined
            }
          />
        ) : null}
        {rows.length > 0 && shown.length === 0 ? (
          <p className="px-4 py-12 text-center text-sm text-ink-2" data-testid="permit-none">
            {NONE[nav.filter]}
          </p>
        ) : null}
        {shown.length > 0 ? (
          <PermitLog
            rows={shown}
            steps={progress.data ? stepsByPermit(progress.data) : undefined}
            showJob={projectId === null}
            selectedId={itemId}
            isPhone={isPhone}
            onOpen={nav.open}
          />
        ) : null}
      </Card>
    </Frame>
  );
}
