// The calendar's right column: the add form (item "new"), or an opened manual line with its edit form. People without
// calendar.manage, and module lines opened by address, get the line itself and (for module lines) a way to its item.
import { useCalendarLine } from '../../data/calendar.queries';
import type { CalendarLine } from '../../data/calendar.types';
import { useCapability } from '../../data/queries';
import { kindLabel, lineTarget } from '../../lib/calendarKinds';
import { formatInZone } from '../../lib/dates';
import { Button } from '../../ui/Button';
import { EmptyState, ErrorState, LoadingState } from '../../ui/States';
import { AddLine } from './AddLine';
import { EditLine } from './EditLine';
import { lineTime, NEW_LINE } from './model';
import { useCalendarNav, type CalendarNav } from './useCalendarNav';

interface CalendarItemProps {
  /** null = "All my jobs". */
  projectId: string | null;
  itemId: string;
}

function LineSummary({ line, nav }: { line: CalendarLine; nav: CalendarNav }) {
  const opensElsewhere = line.source_type !== 'manual' && lineTarget(line) !== null;
  return (
    <div className="flex flex-col gap-2 p-4">
      <p className="break-words text-base font-semibold text-ink">{line.title}</p>
      <p className="text-sm text-ink-2">
        {formatInZone(line.starts_at, line.timezone, 'EEE, MMM d, yyyy')} · {lineTime(line)}
      </p>
      <p className="text-sm text-ink-2">
        {kindLabel(line.kind)} · {line.project_name}
      </p>
      {line.location ? <p className="text-sm text-ink">{line.location}</p> : null}
      {opensElsewhere ? (
        <div>
          <Button
            onClick={() => {
              nav.openLine(line);
            }}
          >
            Open
          </Button>
        </div>
      ) : null}
    </div>
  );
}

function OpenLine({ itemId, nav }: { itemId: string; nav: CalendarNav }) {
  const line = useCalendarLine(itemId);
  const manage = useCapability(line.data?.project_id ?? null, 'calendar.manage');

  if (line.isPending) return <LoadingState label="Loading" />;
  if (line.isError) return <ErrorState error={line.error} onRetry={() => void line.refetch()} />;
  if (line.data === null) return <EmptyState title="This line is gone." />;
  if (line.data.source_type !== 'manual') return <LineSummary line={line.data} nav={nav} />;
  if (manage.isPending) return <LoadingState label="Loading" />;
  if (manage.isError) return <ErrorState error={manage.error} onRetry={() => void manage.refetch()} />;
  if (!manage.data) return <LineSummary line={line.data} nav={nav} />;
  // Re-keyed on version: after a save the form starts from what the database now holds.
  return <EditLine key={`${line.data.id}:${String(line.data.version)}`} line={line.data} nav={nav} />;
}

export function CalendarItem({ projectId, itemId }: CalendarItemProps) {
  const nav = useCalendarNav(projectId);
  if (itemId === NEW_LINE) return <AddLine projectId={projectId} nav={nav} />;
  return <OpenLine itemId={itemId} nav={nav} />;
}
