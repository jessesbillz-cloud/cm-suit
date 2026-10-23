// The Photos section a wall's page, a room's page and a request show (0102): the Photo box for those who may add, then
// the strip, newest first. Loading, a failure (Retry) and nothing yet each look different; with nothing to show and
// nothing to add there is no section.
import type { ReactNode } from 'react';
import type { UseQueryResult } from '@tanstack/react-query';
import { useMyProjects } from '../../../data/queries';
import type { RevPhoto } from '../../../data/revs.photos';
import { ErrorState, LoadingState } from '../../../ui/States';
import { PhotoList } from './PhotoList';
import { SECTION_HEAD } from '../../../ui/PageHeader';

/** The job's time zone (every time shown goes through it), once the jobs are loaded. */
function useJobZone(projectId: string): string | undefined {
  const jobs = useMyProjects();
  return jobs.data?.find((p) => p.project_id === projectId)?.timezone;
}

interface PhotoSectionProps {
  projectId: string;
  photos: UseQueryResult<RevPhoto[]>;
  /** May I add here (rev_photo_may_add)? */
  may: UseQueryResult<boolean>;
  /** The Photo box, shown to those who may add here. */
  box: ReactNode;
  /** The walls' names, when the photos are of several walls. */
  wallNames?: ReadonlyMap<string, string> | undefined;
  onOpenRequest?: ((requestId: string) => void) | undefined;
  testId: string;
}

export function PhotoSection({ projectId, photos, may, box, wallNames, onOpenRequest, testId }: PhotoSectionProps) {
  const zone = useJobZone(projectId);
  if (may.data === false && photos.data?.length === 0) return null;
  const add = may.isError ? <ErrorState error={may.error} onRetry={() => void may.refetch()} className="m-0" /> : may.data === true ? box : null;
  let strip: ReactNode;
  if (photos.isError) strip = <ErrorState error={photos.error} onRetry={() => void photos.refetch()} title="Photos did not load." className="m-0" />;
  else if (photos.isPending || zone === undefined) strip = <LoadingState label="Loading photos" />;
  else strip = <PhotoList projectId={projectId} photos={photos.data} timeZone={zone} wallNames={wallNames} onOpenRequest={onOpenRequest} />;
  return (
    <section className="flex flex-col gap-2" data-testid={testId} data-count={photos.data?.length}>
      <h2 className={SECTION_HEAD}>Photos</h2>
      {add}
      {strip}
    </section>
  );
}
