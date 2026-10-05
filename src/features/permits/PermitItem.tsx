// The right column (full screen on the phone) for the permit tool: the new-permit form (on a job, for the official), or
// one permit (on a job, or from the caseload on All my jobs).
import { useCapability } from '../../data/queries';
import { Card } from '../../ui/Card';
import { EmptyState, ErrorState, LoadingState } from '../../ui/States';
import { NEW_ITEM } from './model';
import { PermitForm } from './PermitForm';
import { PermitPane } from './PermitPane';
import { usePermitsNav } from './usePermitsNav';

interface PermitItemProps {
  /** null: opened from the caseload (All my jobs). */
  projectId: string | null;
  itemId: string;
  isPhone: boolean;
  /** The right column at full width: the full view, History too. */
  wide?: boolean | undefined;
  onOpenWindow?: (() => void) | undefined;
}

function NewPermit({ projectId }: { projectId: string }) {
  const nav = usePermitsNav(projectId, NEW_ITEM);
  const manage = useCapability(projectId, 'permits.manage');
  if (manage.isError) return <ErrorState error={manage.error} onRetry={() => void manage.refetch()} />;
  if (manage.isPending) return <LoadingState />;
  if (!manage.data) {
    return (
      <Card>
        <EmptyState title="You can't add permits on this job." />
      </Card>
    );
  }
  return <PermitForm projectId={projectId} onCreated={nav.replace} />;
}

export function PermitItem({ projectId, itemId, isPhone, wide = false, onOpenWindow }: PermitItemProps) {
  const nav = usePermitsNav(projectId, itemId);
  if (itemId === NEW_ITEM) {
    return projectId === null ? <EmptyState title="Pick a job to add a permit." /> : <NewPermit projectId={projectId} />;
  }
  return (
    <PermitPane
      key={itemId}
      itemId={itemId}
      showJob={projectId === null}
      full={nav.standalone || isPhone || wide}
      isPhone={isPhone}
      onOpenWindow={onOpenWindow}
    />
  );
}
