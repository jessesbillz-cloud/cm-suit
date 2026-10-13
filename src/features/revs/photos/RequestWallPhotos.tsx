// A request's photos and notes per wall (0102; Jesse, Oct 12: "when somebody's doing the inspection, there should be a
// way to attach a photo, or add a comment, a note: what's going on with this wall - it's not done, we had to take the
// drywall back off"). On the request (and on its receipt, right after filing): the Photo box with the request's walls
// to pick from (one wall: picked), for its requester until it is decided and for the one who decides it, then its
// photos, each named by its wall. Each is the wall's photo too: it shows on the wall's page. Once the request is
// decided they are part of its record.
import { useMemo, useState } from 'react';
import { useIsPhone } from '../../../app/frame/useIsPhone';
import { useRevPhotoMayAdd, useRevPhotos } from '../../../data/revs.photos';
import { useIrRevItems, useRevSetup } from '../../../data/revs.queries';
import { ChipPick } from '../../../ui/ChipPick';
import { ErrorState } from '../../../ui/States';
import { PhotoBox } from './PhotoBox';
import { PhotoSection } from './PhotoSection';

interface RequestWallPhotosProps {
  projectId: string;
  requestId: string;
}

export function RequestWallPhotos({ projectId, requestId }: RequestWallPhotosProps) {
  const isPhone = useIsPhone();
  const cells = useIrRevItems(requestId);
  const setup = useRevSetup(projectId);
  const photos = useRevPhotos(projectId, { requestId });
  const may = useRevPhotoMayAdd(projectId, requestId);
  const [wall, setWall] = useState<string | null>(null);
  // The request's walls in its own order, by name.
  const names = useMemo(() => {
    const ids = [...new Set((cells.data ?? []).map((c) => c.area_id))];
    return new Map(ids.map((id): [string, string] => [id, setup.data?.areas.find((a) => a.id === id)?.name ?? 'Wall']));
  }, [cells.data, setup.data]);
  if (setup.isError) return <ErrorState error={setup.error} onRetry={() => void setup.refetch()} className="m-0" />;
  if (names.size === 0) return null;
  const only = names.size === 1 ? [...names.keys()][0] : undefined;
  const picked = only ?? (wall !== null && names.has(wall) ? wall : null);
  const picker =
    only === undefined ? (
      <ChipPick
        label="Wall"
        chips={[...names].map(([value, label]) => ({ value, label }))}
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
      box={
        <PhotoBox
          projectId={projectId}
          isPhone={isPhone}
          place={picked === null ? null : { areaId: picked, roomId: null, requestId }}
          picker={picker}
        />
      }
      wallNames={names.size > 1 ? names : undefined}
      testId="ir-wall-photos"
    />
  );
}
