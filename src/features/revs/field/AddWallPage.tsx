// A wall added on the spot (0113): its own screen, from the cards or from a room (?room=), for whoever files OFS
// requests or manages the cards. Saved, the new wall's 3-D page opens in its place, ready for Add.
import type { ReactNode } from 'react';
import { useSearch } from '@tanstack/react-router';
import { ChevronLeft } from 'lucide-react';
import { useRevSetup } from '../../../data/revs.queries';
import { useRevRooms } from '../../../data/revs.rooms';
import { Card } from '../../../ui/Card';
import { Icon } from '../../../ui/Icon';
import { PageHeader } from '../../../ui/PageHeader';
import { EmptyState, ErrorState, LoadingState } from '../../../ui/States';
import { TOOL_META } from '../../../ui/tools';
import { useBasket } from '../basket/useBasket';
import { jobLevels, pickedLevel } from '../levels';
import { useRevsNav } from '../useRevsNav';
import { AddWallForm } from './AddWallForm';

interface AddWallPageProps {
  projectId: string;
  isPhone: boolean;
  canManage: boolean;
}

export function AddWallPage({ projectId, isPhone, canManage }: AddWallPageProps) {
  const own: { room?: string | undefined; level?: string | undefined } = useSearch({ strict: false });
  const nav = useRevsNav(projectId, canManage);
  const setup = useRevSetup(projectId);
  const rooms = useRevRooms(projectId);
  const basket = useBasket(projectId);
  const room = own.room === undefined ? null : (rooms.data?.rooms.find((r) => r.id === own.room) ?? null);
  const back = () => {
    if (room) nav.openRoom(room.id, true);
    else nav.close();
  };

  let body: ReactNode;
  const failed = [setup, rooms].find((q) => q.isError);
  if (failed) body = <ErrorState error={failed.error} onRetry={() => void failed.refetch()} />;
  else if (!setup.data || !rooms.data || !basket.ready) body = <LoadingState label="Loading the cards" />;
  else if (!basket.can && !canManage) body = <EmptyState title="You don't add walls on this job." />;
  else if (setup.data.lists.length === 0) body = <EmptyState title="No inspection card on this job yet." />;
  else {
    const level = pickedLevel(own.level, jobLevels([...setup.data.areas, ...rooms.data.rooms]));
    body = (
      <AddWallForm
        projectId={projectId}
        setup={setup.data}
        rooms={rooms.data}
        room={room}
        level={level}
        onAdded={(areaId, roomId) => {
          nav.openFromRoom(areaId, roomId, undefined, true);
        }}
      />
    );
  }
  const head = <PageHeader title="Add wall" icon={TOOL_META.revs.icon} />;
  return (
    <div className={`flex flex-col gap-2 ${isPhone ? 'px-4 pt-3' : ''}`} data-testid="field-wall-page">
      <button type="button" className="-ml-1 flex h-8 items-center gap-0.5 self-start text-sm font-medium text-accent" data-testid="field-back" onClick={back}>
        <Icon icon={ChevronLeft} size={16} />
        Back
      </button>
      {head}
      {isPhone ? body : <Card>{body}</Card>}
    </div>
  );
}
