// The Requirements tool's right column (the phone's full screen): a new requirement by hand, the spec reader, or one
// requirement. Adding and reading need requirements.manage; what shows is decided by has_capability.
import type { ReactNode } from 'react';
import { useCapability } from '../../data/queries';
import { Card } from '../../ui/Card';
import { EmptyState, ErrorState, LoadingState } from '../../ui/States';
import { NEW_ITEM, READ_ITEM } from './model';
import { ReadSpec } from './ReadSpec';
import { RequirementForm } from './RequirementForm';
import { RequirementPane } from './RequirementPane';
import { useRequirementsNav } from './useRequirementsNav';

interface RequirementsItemProps {
  projectId: string;
  itemId: string;
}

function Needs({ projectId, what, children }: { projectId: string; what: string; children: ReactNode }) {
  const can = useCapability(projectId, 'requirements.manage');
  if (can.isError) return <ErrorState error={can.error} onRetry={() => void can.refetch()} />;
  if (can.isPending) return <LoadingState />;
  if (!can.data) {
    return (
      <Card>
        <EmptyState title={`You can't ${what} on this job.`} />
      </Card>
    );
  }
  return children;
}

export function RequirementsItem({ projectId, itemId }: RequirementsItemProps) {
  const nav = useRequirementsNav(projectId);
  const manage = useCapability(projectId, 'requirements.manage');
  if (itemId === NEW_ITEM) {
    return (
      <Needs projectId={projectId} what="add requirements">
        <div className="p-4">
          <RequirementForm projectId={projectId} row={null} onSaved={(id) => { nav.openIn('all', id); }} onCancel={nav.close} />
        </div>
      </Needs>
    );
  }
  if (itemId === READ_ITEM) {
    return (
      <Needs projectId={projectId} what="read the spec book">
        <ReadSpec projectId={projectId} onRead={() => { nav.openIn('drafts', null); }} />
      </Needs>
    );
  }
  if (manage.isError) return <ErrorState error={manage.error} onRetry={() => void manage.refetch()} />;
  if (manage.isPending) return <LoadingState />;
  return <RequirementPane key={itemId} projectId={projectId} id={itemId} canManage={manage.data} onClose={nav.close} />;
}
