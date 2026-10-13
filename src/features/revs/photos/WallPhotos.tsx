// A wall's photos and notes on its page (0102; Jesse, Oct 12: "go take a picture of all our walls the way they are right
// now"): the Photo box for those who may add (tied to the wall, and to the room it was opened from), then every photo
// of the wall I may see, a request's too (its IR number opens the request).
import { useRevPhotoMayAdd, useRevPhotos } from '../../../data/revs.photos';
import { useRevsNav } from '../useRevsNav';
import { PhotoBox } from './PhotoBox';
import { PhotoSection } from './PhotoSection';

interface WallPhotosProps {
  projectId: string;
  areaId: string;
  isPhone: boolean;
}

export function WallPhotos({ projectId, areaId, isPhone }: WallPhotosProps) {
  const nav = useRevsNav(projectId, false);
  const photos = useRevPhotos(projectId, { areaId });
  const may = useRevPhotoMayAdd(projectId, null);
  const place = { areaId, roomId: nav.fromRoom ?? null, requestId: null };
  return (
    <PhotoSection
      projectId={projectId}
      photos={photos}
      may={may}
      box={<PhotoBox projectId={projectId} isPhone={isPhone} place={place} />}
      onOpenRequest={nav.openRequest}
      testId="rev-wall-photos"
    />
  );
}
