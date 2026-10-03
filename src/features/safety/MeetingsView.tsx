// The job's meetings, newest first: two tight lines each (the number and the whole title with open / closed at the
// right; then the kind, the day, the leader and how many signed). A tap opens it beside the list.
import { Plus } from 'lucide-react';
import { useSafetyMeetings } from '../../data/safety.queries';
import type { MeetingRow } from '../../data/safety.types';
import { Button } from '../../ui/Button';
import { Card } from '../../ui/Card';
import { EmptyState, ErrorState, LoadingState } from '../../ui/States';
import { StatusChip } from '../../ui/StatusChip';
import { phoneRowClass } from '../../ui/Table';
import { TOOL_META } from '../../ui/tools';
import { rowFacts } from './model';

interface MeetingsViewProps {
  projectId: string;
  selectedId: string | null;
  isPhone: boolean;
  onOpen: (id: string) => void;
  /** Present when I may start one. */
  onNew?: (() => void) | undefined;
}

export function MeetingStatus({ status }: { status: 'open' | 'closed' }) {
  return status === 'open' ? <StatusChip status="pending" label="Open" /> : <StatusChip status="confirmed" label="Closed" />;
}

function Row({ row, selected, isPhone, onOpen }: { row: MeetingRow; selected: boolean; isPhone: boolean; onOpen: (id: string) => void }) {
  return (
    <li>
      <button
        type="button"
        data-testid={`safety-row-${String(row.number)}`}
        aria-current={selected ? 'true' : undefined}
        className={`${phoneRowClass(selected)} flex flex-col gap-1 ${selected ? '' : 'hover:bg-page/60'} ${isPhone ? '' : 'py-2.5'}`}
        onClick={() => {
          onOpen(row.id);
        }}
      >
        <span className="flex w-full items-start gap-3">
          <span className="min-w-0 flex-1 whitespace-normal break-words text-[15px] leading-6 text-ink">
            <span className="mr-2 font-semibold tabular-nums">{row.number}</span>
            {row.title}
          </span>
          <span className="shrink-0 pt-0.5">
            <MeetingStatus status={row.status} />
          </span>
        </span>
        <span className="text-[13px] leading-5 text-ink-2">{rowFacts(row)}</span>
      </button>
    </li>
  );
}

export function MeetingsView({ projectId, selectedId, isPhone, onOpen, onNew }: MeetingsViewProps) {
  const list = useSafetyMeetings(projectId);
  return (
    <Card padded={false} className="overflow-hidden">
      {list.isPending ? <LoadingState label="Loading meetings" /> : null}
      {list.isError ? <ErrorState error={list.error} onRetry={() => void list.refetch()} /> : null}
      {list.isSuccess && list.data.length === 0 ? (
        <EmptyState
          icon={TOOL_META.safety.icon}
          title="No meetings yet."
          action={
            onNew ? (
              <Button variant="primary" icon={Plus} onClick={onNew}>
                New meeting
              </Button>
            ) : undefined
          }
        />
      ) : null}
      {list.isSuccess && list.data.length > 0 ? (
        <ul className="divide-y divide-line" data-testid="safety-meetings">
          {list.data.map((r) => (
            <Row key={r.id} row={r} selected={selectedId === r.id} isPhone={isPhone} onOpen={onOpen} />
          ))}
        </ul>
      ) : null}
    </Card>
  );
}
