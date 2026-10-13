// A room's photos and notes on its page (0102): the Photo box with the room's walls to pick from (one tap picks the
// wall the photo is of, none: the whole room), then the room's own photos and every one of its walls', each named by
// its wall's bubble.
import { useMemo, useState } from 'react';
import { useRevPhotoMayAdd, useRevPhotos } from '../../../data/revs.photos';
import { ChipPick } from '../../../ui/ChipPick';
import type { RoomWall } from '../rooms';
import { useRevsNav } from '../useRevsNav';
import { PhotoBox } from './PhotoBox';
import { PhotoSection } from './PhotoSection';

interface RoomPhotosProps {
  projectId: string;
  roomId: string;
  walls: readonly RoomWall[];
  isPhone: boolean;
}

export function RoomPhotos({ projectId, roomId, walls, isPhone }: RoomPhotosProps) {
  const nav = useRevsNav(projectId, false);
  const photos = useRevPhotos(projectId, { roomId });
  const may = useRevPhotoMayAdd(projectId, null);
  const [wall, setWall] = useState<string | null>(null);
  const names = useMemo(() => new Map(walls.map((w): [string, string] => [w.area.id, w.title])), [walls]);
  // A wall taken out of the room meanwhile is no longer picked.
  const picked = wall !== null && names.has(wall) ? wall : null;
  const picker =
    walls.length > 0 ? (
      <ChipPick
        label="Wall"
        chips={walls.map((w) => ({ value: w.area.id, label: w.title }))}
        picked={picked === null ? [] : [picked]}
        onChange={(next) => {
          setWall(next[0] ?? null);
        }}
        testId="rev-photo-wall"
      />
    ) : null;
  return (
    <PhotoSection
      projectId={projectId}
      photos={photos}
      may={may}
      box={<PhotoBox projectId={projectId} isPhone={isPhone} place={{ areaId: picked, roomId, requestId: null }} picker={picker} />}
      wallNames={names}
      onOpenRequest={nav.openRequest}
      testId="rev-room-photos"
    />
  );
}
