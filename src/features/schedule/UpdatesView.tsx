// The job's schedule versions: drafts waiting first (to the people who publish), then the current update, then the
// older ones. Two lines each: which one and its state; the data date, where it came from and how many activities.
import { ChartGantt } from 'lucide-react';
import type { ReactNode } from 'react';
import { useScheduleVersions } from '../../data/schedule.queries';
import type { VersionRow } from '../../data/schedule.types';
import { formatDay } from '../../lib/dates';
import { Card } from '../../ui/Card';
import { EmptyState, ErrorState, LoadingState } from '../../ui/States';
import { StatusChip } from '../../ui/StatusChip';
import { phoneRowClass } from '../../ui/Table';
import { draftItemId, sourceLabel, versionItemId, versionName } from './model';

interface UpdatesViewProps {
  projectId: string;
  selectedId: string | null;
  onOpen: (itemId: string) => void;
  /** The Upload button, when I may upload. */
  upload?: ReactNode | undefined;
}

export function VersionChip({ status }: { status: VersionRow['status'] }) {
  if (status === 'draft') return <StatusChip status="pending" label="Draft" />;
  return status === 'current' ? <StatusChip status="confirmed" label="Current" /> : <StatusChip status="cancelled" label="Superseded" />;
}

function facts(v: VersionRow): string {
  const count = `${String(v.activities)} ${v.activities === 1 ? 'activity' : 'activities'}`;
  return [v.data_date ? `Data date ${formatDay(v.data_date, 'MMM d, yyyy')}` : 'No data date', sourceLabel(v.source_kind), count].join(' · ');
}

function Row({ v, selected, onOpen }: { v: VersionRow; selected: boolean; onOpen: (itemId: string) => void }) {
  const itemId = v.status === 'draft' ? draftItemId(v.id) : versionItemId(v.id);
  return (
    <li>
      <button
        type="button"
        data-testid={`schedule-version-${v.number === null ? 'draft' : String(v.number)}`}
        aria-current={selected ? 'true' : undefined}
        className={`${phoneRowClass(selected)} flex flex-col gap-1 sm:py-2.5 ${selected ? '' : 'hover:bg-page/60'}`}
        onClick={() => {
          onOpen(itemId);
        }}
      >
        <span className="flex w-full items-start gap-3">
          <span className="min-w-0 flex-1 whitespace-normal break-words text-[15px] leading-6 text-ink">
            <span className="mr-2 font-semibold">{versionName(v)}</span>
            {v.title ?? v.file_name ?? ''}
          </span>
          <span className="shrink-0 pt-0.5">
            <VersionChip status={v.status} />
          </span>
        </span>
        <span className="text-[13px] leading-5 text-ink-2">{facts(v)}</span>
      </button>
    </li>
  );
}

export function UpdatesView({ projectId, selectedId, onOpen, upload }: UpdatesViewProps) {
  const list = useScheduleVersions(projectId);
  const selected = (v: VersionRow) => selectedId === draftItemId(v.id) || selectedId === versionItemId(v.id);
  return (
    <Card padded={false} className="overflow-hidden">
      {list.isPending ? <LoadingState label="Loading updates" /> : null}
      {list.isError ? <ErrorState error={list.error} onRetry={() => void list.refetch()} /> : null}
      {list.isSuccess && list.data.length === 0 ? <EmptyState icon={ChartGantt} title="No schedule yet." action={upload} /> : null}
      {list.isSuccess && list.data.length > 0 ? (
        <ul className="divide-y divide-line" data-testid="schedule-versions">
          {list.data.map((v) => (
            <Row key={v.id} v={v} selected={selected(v)} onOpen={onOpen} />
          ))}
        </ul>
      ) : null}
    </Card>
  );
}
