// Manager side of bids (SPEC §11.2–11.6): one compact switch on top, the picked list below, the row in the right column.
import { useBidsOpen } from '../../data/bids.queries';
import { useProject } from '../../data/queries';
import { ErrorState, LoadingState } from '../../ui/States';
import { AddendaView } from './AddendaView';
import { CoverageView } from './CoverageView';
import type { BidsView } from './model';
import { PackagesView } from './PackagesView';
import { QuestionsView } from './QuestionsView';
import { ReceivedView } from './ReceivedView';
import { Segmented } from './Segmented';
import { useBidsNav } from './useBidsNav';

interface ManagerBidsProps {
  projectId: string;
  itemId: string | null;
}

const SEALED: readonly BidsView[] = ['received'];
const NONE: readonly BidsView[] = [];

export function ManagerBids({ projectId, itemId }: ManagerBidsProps) {
  const nav = useBidsNav(projectId);
  const open = useBidsOpen(projectId);
  const project = useProject(projectId);

  if (project.isPending) return <LoadingState label="Loading bids" />;
  if (project.isError) return <ErrorState error={project.error} onRetry={() => void project.refetch()} />;

  const isOpen = open.data === true;
  const view: BidsView = nav.view === 'received' && !isOpen ? 'coverage' : nav.view;
  const tz = project.data.timezone;
  const onOpen = (id: string) => {
    nav.open(id, view);
  };
  const common = { projectId, selectedId: itemId, onOpen };

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-3">
      <Segmented current={view} hidden={isOpen ? NONE : SEALED} onPick={nav.setView} />
      {open.isError ? <ErrorState error={open.error} onRetry={() => void open.refetch()} /> : null}
      {view === 'coverage' ? <CoverageView {...common} /> : null}
      {view === 'packages' ? <PackagesView {...common} orgId={project.data.org_id} /> : null}
      {view === 'questions' ? <QuestionsView {...common} tz={tz} /> : null}
      {view === 'addenda' ? <AddendaView {...common} /> : null}
      {view === 'received' ? <ReceivedView {...common} orgId={project.data.org_id} tz={tz} /> : null}
    </div>
  );
}
