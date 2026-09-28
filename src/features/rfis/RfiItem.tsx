// The right column (full screen on the phone) for the RFI tool: the new-RFI form, or one RFI.
import { useProject } from '../../data/queries';
import { Card } from '../../ui/Card';
import { EmptyState, ErrorState, LoadingState } from '../../ui/States';
import { NEW_ITEM } from './model';
import { RfiCompose } from './RfiCompose';
import { RfiPane } from './RfiPane';
import { useRfiCaps } from './useRfiCaps';
import { useRfisNav } from './useRfisNav';

interface RfiItemProps {
  projectId: string;
  itemId: string;
  isPhone: boolean;
  onOpenWindow?: (() => void) | undefined;
}

function NewRfi({ projectId, isPhone }: { projectId: string; isPhone: boolean }) {
  const nav = useRfisNav(projectId, NEW_ITEM);
  const { caps, error, retry } = useRfiCaps(projectId);
  const project = useProject(projectId);
  if (error) return <ErrorState error={error} onRetry={retry} />;
  if (project.isError) return <ErrorState error={project.error} onRetry={() => void project.refetch()} />;
  if (!caps || project.isPending) return <LoadingState />;
  if (!caps.create) {
    return (
      <Card>
        <EmptyState title="You can't write RFIs on this job." />
      </Card>
    );
  }
  return (
    <RfiCompose
      projectId={projectId}
      row={null}
      photos={[]}
      returned={null}
      timeZone={project.data.timezone}
      isPhone={isPhone}
      onSent={nav.replace}
      onDiscarded={nav.close}
    />
  );
}

export function RfiItem({ projectId, itemId, isPhone, onOpenWindow }: RfiItemProps) {
  if (itemId === NEW_ITEM) return <NewRfi projectId={projectId} isPhone={isPhone} />;
  return <RfiPane key={itemId} projectId={projectId} itemId={itemId} isPhone={isPhone} onOpenWindow={onOpenWindow} />;
}
