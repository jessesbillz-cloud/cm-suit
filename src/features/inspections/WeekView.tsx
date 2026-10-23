// The job's inspection calendar for a week (SPEC §13.2): live (refetches every 30 s), colors from lib/status, times
// and types for everyone, full detail only for my own requests (or all of them for the GC team and inspectors).
// Desktop: seven columns, today's tinted. Phone: the days one under another (WeekFrame).
import { useIrCalendar } from '../../data/inspections.queries';
import { EntryLine } from './EntryLine';
import { weekOf } from './time';
import { WeekFrame } from './WeekFrame';

interface WeekViewProps {
  projectId: string;
  day: string;
  today: string;
  selectedId: string | null;
  isPhone: boolean;
  /** I decide OFS requests (the deputy): the lines' words follow. */
  ofsDecide: boolean;
  onDay: (day: string) => void;
  onPickDay: (day: string) => void;
  onOpen: (id: string) => void;
}

export function WeekView({ projectId, day, today, selectedId, isPhone, ofsDecide, onDay, onPickDay, onOpen }: WeekViewProps) {
  const { from, to } = weekOf(day);
  const cal = useIrCalendar(projectId, from, to);
  const requests = cal.data?.filter((r) => !r.is_block).length ?? 0;

  return (
    <WeekFrame
      day={day}
      today={today}
      isPhone={isPhone}
      count={cal.data ? (requests === 0 ? 'Nothing booked' : requests === 1 ? '1 request' : `${String(requests)} requests`) : null}
      loading={cal.isPending}
      error={cal.isError ? cal.error : null}
      onRetry={() => void cal.refetch()}
      onDay={onDay}
      onPickDay={onPickDay}
      renderDay={(d) => {
        const rows = (cal.data ?? []).filter((r) => r.request_date === d);
        if (rows.length === 0) return null;
        return (
          <div className={`flex flex-col gap-1.5 ${isPhone ? 'px-4 pb-3' : 'p-1.5'}`}>
            {rows.map((r, i) => (
              <EntryLine
                key={r.id ?? `${d}-${String(i)}`}
                row={r}
                selected={r.id !== null && r.id === selectedId}
                ofsDecide={ofsDecide}
                onOpen={onOpen}
              />
            ))}
          </div>
        );
      }}
    />
  );
}
