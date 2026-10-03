// The right column for revs (full screen on the phone): a wall, or a setup form (a new list from the legend, walls to
// add) for those who manage the lists.
import type { ReactNode } from 'react';
import { useCapability } from '../../data/queries';
import { NEW_ITEM, WALLS_ITEM } from '../../lib/itemIds';
import { Card } from '../../ui/Card';
import { EmptyState, ErrorState, LoadingState } from '../../ui/States';
import { AddWalls } from './AddWalls';
import { NewList } from './NewList';
import { WallPane } from './WallPane';

interface RevsItemProps {
  projectId: string;
  itemId: string;
  isPhone: boolean;
}

function ManagersOnly({ projectId, children }: { projectId: string; children: ReactNode }) {
  const manage = useCapability(projectId, 'revs.manage');
  if (manage.isError) return <ErrorState error={manage.error} onRetry={() => void manage.refetch()} />;
  if (manage.isPending) return <LoadingState />;
  if (!manage.data) {
    return (
      <Card>
        <EmptyState title="You can't set up revs on this job." />
      </Card>
    );
  }
  return children;
}

export function RevsItem({ projectId, itemId, isPhone }: RevsItemProps) {
  if (itemId === NEW_ITEM) {
    return (
      <ManagersOnly projectId={projectId}>
        <NewList projectId={projectId} />
      </ManagersOnly>
    );
  }
  if (itemId === WALLS_ITEM) {
    return (
      <ManagersOnly projectId={projectId}>
        <AddWalls projectId={projectId} />
      </ManagersOnly>
    );
  }
  return <WallPane key={itemId} projectId={projectId} areaId={itemId} isPhone={isPhone} />;
}
