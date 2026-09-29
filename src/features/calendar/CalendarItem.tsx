// The calendar's right column: the add form (item "new"), blocked time, the feed link, a request with the inspector's
// steps (inspections' RequestPane; the calendar stays beside it), or an opened manual line with its edit form. People
// without calendar.manage, and module lines opened by address, get the line itself and (for module lines) a way to
// its item.
import { useCalendarLine } from '../../data/calendar.queries';
import type { CalendarLine } from '../../data/calendar.types';
import { useCapability } from '../../data/queries';
import { kindLabel, lineTarget } from '../../lib/calendarKinds';
import { formatInZone } from '../../lib/dates';
import { Button } from '../../ui/Button';
import { EmptyState, ErrorState, LoadingState } from '../../ui/States';
import { StatusChip } from '../../ui/StatusChip';
import { TOOL_META } from '../../ui/tools';
import { RequestPane } from '../inspections/RequestPane';
import { AddLine } from './AddLine';
import { BlockPanel } from './BlockPanel';
import { EditLine } from './EditLine';
import { KindTile } from './LineRow';
import { BLOCK_ITEM, lineTime, NEW_LINE, parseRequestItem, statusKey, SUBSCRIBE_ITEM } from './model';
import { SubscribePanel } from './SubscribePanel';
import { useCalendarNav, type CalendarNav } from './useCalendarNav';

interface CalendarItemProps {
  /** null = "All my jobs". */
  projectId: string | null;
  itemId: string;
}

function LineSummary({ line, nav }: { line: CalendarLine; nav: CalendarNav }) {
  const opensElsewhere = line.source_type !== 'manual' && lineTarget(line) !== null;
  const key = statusKey(line.status);
  return (
    <div className="flex flex-col gap-4 p-4">
      <div className="flex items-start gap-3">
        <KindTile kind={line.kind} />
        <div className="min-w-0 flex-1">
          <p className="break-words text-[17px] font-semibold leading-6 text-ink">{line.title}</p>
          <p className="text-sm text-ink-2">
            {kindLabel(line.kind)} · {line.project_name}
          </p>
        </div>
        {key ? <StatusChip status={key} /> : null}
      </div>
      <dl className="grid grid-cols-[4.5rem_minmax(0,1fr)] gap-x-3 gap-y-2 text-sm">
        <dt className="text-ink-3">When</dt>
        <dd className="text-ink">
          {formatInZone(line.starts_at, line.timezone, 'EEE, MMM d, yyyy')} · {lineTime(line)}
        </dd>
        {line.location ? (
          <>
            <dt className="text-ink-3">Where</dt>
            <dd className="break-words text-ink">{line.location}</dd>
          </>
        ) : null}
      </dl>
      {opensElsewhere ? (
        <div>
          <Button
            variant="primary"
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
  if (line.data === null) return <EmptyState title="This line is gone." icon={TOOL_META.calendar.icon} />;
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
  if (itemId === BLOCK_ITEM) return <BlockPanel projectId={projectId} nav={nav} />;
  if (itemId === SUBSCRIBE_ITEM) return <SubscribePanel />;
  const request = parseRequestItem(itemId);
  if (request) return <RequestPane key={itemId} projectId={request.projectId} requestId={request.requestId} />;
  return <OpenLine itemId={itemId} nav={nav} />;
}
