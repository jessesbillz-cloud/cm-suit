// Before sending or moving: that day's bookings on this job, everyone's (anonymized by the database), and which ones
// the picked time overlaps (DayList). A heads-up only: requests are never refused. MDR's preview could not see this
// job's own bookings.
import { useIrCalendar } from '../../data/inspections.queries';
import type { IrWhen } from '../../data/inspections.types';
import { DayList } from './DayList';

interface ConflictPreviewProps {
  projectId: string;
  when: IrWhen;
  /** When moving a request: itself is not a conflict. */
  ownId: string | null;
}

export function ConflictPreview({ projectId, when, ownId }: ConflictPreviewProps) {
  const day = useIrCalendar(projectId, when.date, when.date);
  const rows = day.data?.filter((r) => r.id === null || r.id !== ownId);
  return <DayList when={when} rows={rows} error={day.isError ? day.error : null} onRetry={() => void day.refetch()} />;
}
