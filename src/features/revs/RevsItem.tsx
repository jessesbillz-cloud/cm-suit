// A revs item: a setup form for those who manage the lists (a new list from the legend, walls to add; the right column
// on a desktop), a wall's or a room's page on the phone (full screen) and in its own window (on a desktop it fills the
// main area), or a sign-off's OFS IR beside a wall's page (the right column, 0083).
import type { ReactNode } from 'react';
import { useCapability } from '../../data/queries';
import { NEW_ITEM, REV_FILE_PREFIX, ROOM_ITEM_PREFIX, WALLS_ITEM } from '../../lib/itemIds';
import { Card } from '../../ui/Card';
import { EmptyState, ErrorState, LoadingState } from '../../ui/States';
import { AddWalls } from './AddWalls';
import { NewList } from './NewList';
import { RevFilePane } from './room/RevFilePane';
import { RoomPage } from './room/RoomPage';
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
  if (itemId.startsWith(REV_FILE_PREFIX)) return <RevFilePane key={itemId} projectId={projectId} fileId={itemId.slice(REV_FILE_PREFIX.length)} />;
  if (itemId.startsWith(ROOM_ITEM_PREFIX)) {
    return <RoomPage key={itemId} projectId={projectId} roomId={itemId.slice(ROOM_ITEM_PREFIX.length)} isPhone={isPhone} />;
  }
  return <WallPage key={itemId} projectId={projectId} areaId={itemId} isPhone={isPhone} />;
}
