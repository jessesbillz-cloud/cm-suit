// Manager side of bids (SPEC §11.2–11.6): the page header (bid due and coverage) with the sub-views under it, the
// picked list below, the row in the right column.
import { Lock } from 'lucide-react';
import { useBidForms } from '../../data/bidForms';
import { useBidCoverage, useBidsOpen } from '../../data/bids.queries';
import { useProject, type ProjectWithSettings } from '../../data/queries';
import { Card } from '../../ui/Card';
import { Icon } from '../../ui/Icon';
import { PageHeader } from '../../ui/PageHeader';
import { ErrorState, LoadingState } from '../../ui/States';
import { TOOL_META } from '../../ui/tools';
import { AddendaView } from './AddendaView';
import { CoverageView } from './CoverageView';
import { missingCount } from './forms';
import { FormsView } from './FormsView';
import { LevelingView } from './LevelingView';
import { coverageLine, SEALED_VIEWS, type BidsView } from './model';
import { NEW_PACKAGE_ITEM } from './packageDraft';
import { PackagesView } from './PackagesView';
import { dueDate } from './pipeline';
import { QuestionsView } from './QuestionsView';
import { ReceivedView } from './ReceivedView';
import { Segmented } from './Segmented';
import { SubsView } from './SubsView';
import { SummaryView } from './SummaryView';
import { useBidsNav } from './useBidsNav';

interface ManagerBidsProps {
  projectId: string;
  itemId: string | null;
}

const NONE: readonly BidsView[] = [];

/** "Bid due Oct 2, 2:00 PM · 18 of 32 packages covered": what's known so far. */
function metaLine(project: ProjectWithSettings, coverage: readonly { submitted: number }[] | undefined): string | undefined {
  const parts = [
    project.bid_due_at !== null ? `Bid due ${dueDate(project.bid_due_at, project.timezone)}` : null,
    coverage ? coverageLine(coverage) : null,
  ].filter((p): p is string => p !== null);
  return parts.length > 0 ? parts.join(' · ') : undefined;
}

/** Where Received, Leveling and Summary would be while a sealed job waits for bid time (SPEC §11.4). */
function sealedLine(project: ProjectWithSettings): string {
  return project.bid_due_at !== null ? `Sealed until ${dueDate(project.bid_due_at, project.timezone)}` : 'Sealed';
}

export function ManagerBids({ projectId, itemId }: ManagerBidsProps) {
  const nav = useBidsNav(projectId);
  const open = useBidsOpen(projectId);
  const project = useProject(projectId);
  const forms = useBidForms(projectId);
  const coverage = useBidCoverage(projectId);

  if (project.isPending || project.isError) {
    return (
      <div className="mx-auto max-w-5xl">
        <PageHeader title={TOOL_META.bids.label} icon={TOOL_META.bids.icon} />
        <Card padded={false}>
          {project.isError ? <ErrorState error={project.error} onRetry={() => void project.refetch()} /> : <LoadingState label="Loading bids" />}
        </Card>
      </div>
    );
  }

  const isOpen = open.data === true;
  // A link to Received (or Leveling, Summary) while sealed lands on Coverage, with the sealed line saying why.
  const sealedAsked = SEALED_VIEWS.includes(nav.view) && !isOpen;
  const view: BidsView = sealedAsked ? 'coverage' : nav.view;
  const tz = project.data.timezone;
  const onOpen = (id: string) => {
    nav.open(id, view);
  };
  const common = { projectId, selectedId: itemId, onOpen };

  return (
    <div className="mx-auto flex max-w-5xl flex-col">
      <PageHeader
        title={TOOL_META.bids.label}
        icon={TOOL_META.bids.icon}
        meta={metaLine(project.data, coverage.data)}
        below={
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <Segmented
              current={view}
              hidden={isOpen ? NONE : SEALED_VIEWS}
              counts={{ forms: forms.data ? missingCount(forms.data.items, project.data.stage) : 0 }}
              onPick={nav.setView}
            />
            {open.data === false ? (
              <span data-testid="bids-sealed" className={`flex items-center gap-1.5 text-sm ${sealedAsked ? 'font-medium text-ink' : 'text-ink-2'}`}>
                <Icon icon={Lock} size={14} />
                {sealedLine(project.data)}
              </span>
            ) : null}
          </div>
        }
      />
      <div className="flex flex-col gap-3">
        {open.isError ? <ErrorState error={open.error} onRetry={() => void open.refetch()} /> : null}
        {view === 'coverage' ? (
          <CoverageView
            {...common}
            onInvite={() => {
              nav.invite();
            }}
            onAddPackage={() => {
              nav.open(NEW_PACKAGE_ITEM, 'packages');
            }}
          />
        ) : null}
        {view === 'packages' ? <PackagesView {...common} /> : null}
        {view === 'subs' ? <SubsView {...common} orgId={project.data.org_id} /> : null}
        {view === 'questions' ? <QuestionsView {...common} tz={tz} /> : null}
        {view === 'addenda' ? <AddendaView {...common} /> : null}
        {view === 'received' ? <ReceivedView {...common} orgId={project.data.org_id} tz={tz} /> : null}
        {view === 'leveling' ? <LevelingView {...common} packageId={nav.pkg} onPickPackage={nav.setPkg} /> : null}
        {view === 'summary' ? <SummaryView projectId={projectId} onOpenPackage={nav.setPkg} /> : null}
        {view === 'forms' ? <FormsView {...common} project={project.data} /> : null}
      </div>
    </div>
  );
}
