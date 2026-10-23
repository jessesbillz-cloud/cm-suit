// The fire marshal's schedule (0108; Jesse, Oct 22: the texts move here): his OFS requests by the day and time asked,
// one box each, live. Needs a time (Asked, no time yet) sits on top. On a job it is his Inspections week; on All my jobs
// (projectId null) his home, every job at once with the job named on each box. A box opens the request, where he
// confirms it, picks another time or postpones it. Requests filed together (0113) sit together under "Batch of 9",
// with the one tap for those waiting on me (0114).
import { useIrBatchesWaiting } from '../../data/inspections.batch';
import { useOfsSchedule, type ScheduleRow } from '../../data/inspections.schedule';
import { useIrBatches } from '../../data/revs.basket';
import { Card } from '../../ui/Card';
import { CountTitle } from '../board/home/CountTitle';
import { BatchHead, waitingById } from '../ofs/BatchHead';
import { byBatch } from '../ofs/model';
import { OfsBox } from './OfsBox';
import { splitSchedule, whenLabel } from './ofsSchedule';
import { weekOf } from './time';
import { WeekFrame } from './WeekFrame';

interface OfsScheduleProps {
  projectId: string | null;
  day: string;
  today: string;
  isPhone: boolean;
  selectedId: string | null;
  onDay: (day: string) => void;
  onOpen: (row: ScheduleRow) => void;
}

export function OfsSchedule({ projectId, day, today, isPhone, selectedId, onDay, onOpen }: OfsScheduleProps) {
  const { from, to } = weekOf(day);
  const sched = useOfsSchedule(projectId, from, to);
  const { needsTime, dated } = splitSchedule(sched.data ?? []);
  const inWeek = dated.filter((r) => r.request_date >= from && r.request_date <= to);
  const showJob = projectId === null;
  const batches = useIrBatches((sched.data ?? []).map((r) => r.id));
  const waiting = waitingById(useIrBatchesWaiting(projectId).data);
  const box = (r: ScheduleRow, showDay: string | null) => (
    <OfsBox key={r.id} row={r} selected={r.id === selectedId} showJob={showJob} showDay={showDay} onOpen={onOpen} />
  );
  // Requests filed together (0113) under one "Batch of 9" line.
  const boxes = (rows: readonly ScheduleRow[], showDay: (r: ScheduleRow) => string | null) =>
    byBatch(rows, (r) => r.id, batches.data ?? new Map<string, { batchId: string; size: number }>()).map((run) =>
      run.batch === null ? (
        run.rows.map((r) => box(r, showDay(r)))
      ) : (
        <div key={run.batch.id} className="col-span-full flex flex-col gap-1.5 border-l-[3px] border-ink pl-2" data-testid="ofs-batch" data-size={run.batch.size}>
          <BatchHead batchId={run.batch.id} size={run.batch.size} waiting={waiting} />
          {run.rows.map((r) => box(r, showDay(r)))}
        </div>
      ),
    );

  return (
    <div className="flex flex-col gap-3" data-testid="ofs-schedule">
      {needsTime.length > 0 ? (
        <Card title={<CountTitle label="Needs a time" count={needsTime.length} testId="ofs-needs-time-count" />}>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3" data-testid="ofs-needs-time">
            {boxes(needsTime, (r) => whenLabel(r.request_date, null))}
          </div>
        </Card>
      ) : null}
      <WeekFrame
        day={day}
        today={today}
        isPhone={isPhone}
        count={sched.data ? (inWeek.length === 0 ? 'Nothing asked' : `${String(inWeek.length)} OFS`) : null}
        loading={sched.isPending}
        error={sched.isError ? sched.error : null}
        onRetry={() => void sched.refetch()}
        onDay={onDay}
        onPickDay={null}
        renderDay={(d) => {
          const rows = inWeek.filter((r) => r.request_date === d);
          if (rows.length === 0) return null;
          return <div className={`flex flex-col gap-1.5 ${isPhone ? 'px-4 pb-3' : 'p-1.5'}`}>{boxes(rows, () => null)}</div>;
        }}
      />
    </div>
  );
}
