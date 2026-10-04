// The Schedule tool's right column (the phone's full screen): a draft's review (`draft-<id>`; a page of its own on a
// desktop), a published update (`v-<id>`), or an activity (its own id, e.g. from the calendar).
import { ActivityPane } from './ActivityPane';
import { DraftPage } from './DraftPage';
import { itemRef } from './model';
import { VersionPane } from './VersionPane';

interface ScheduleItemProps {
  projectId: string;
  itemId: string;
  isPhone: boolean;
}

export function ScheduleItem({ projectId, itemId, isPhone }: ScheduleItemProps) {
  const ref = itemRef(itemId);
  if (ref.kind === 'draft') return <DraftPage key={ref.id} projectId={projectId} versionId={ref.id} isPhone={isPhone} />;
  if (ref.kind === 'version') return <VersionPane key={ref.id} projectId={projectId} versionId={ref.id} />;
  return <ActivityPane key={ref.id} projectId={projectId} activityId={ref.id} />;
}
