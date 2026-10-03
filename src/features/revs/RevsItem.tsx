// A revs item: a setup form for those who manage the lists (a new list from the legend, walls to add; the right column
// on a desktop), or a wall's page on the phone (full screen) and in its own window (on a desktop it fills the main area).
import type { ReactNode } from 'react';
import { useCapability } from '../../data/queries';
import { NEW_ITEM, WALLS_ITEM } from '../../lib/itemIds';
import { Card } from '../../ui/Card';
import { EmptyState, ErrorState, LoadingState } from '../../ui/States';
import { AddWalls } from './AddWalls';
import { NewList } from './NewList';
import { WallPage } from './WallPage';

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
  return <WallPage key={itemId} projectId={projectId} areaId={itemId} isPhone={isPhone} />;
}
