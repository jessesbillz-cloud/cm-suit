// Block time (inspectors): a day, all day or from / to, optionally every week. Requesters see it as "Blocked" only.
// Saved, it closes back to where it was opened (the inspections tool, or the calendar through onDone).
import { useState } from 'react';
import { CalendarOff } from 'lucide-react';
import { messageOf } from '../../data/errors';
import { useAddBlock } from '../../data/inspections.mutations';
import { todayInZone } from '../../lib/dates';
import { Button } from '../../ui/Button';
import { CheckField, SelectField, TextField } from '../../ui/Fields';
import { ErrorState, LoadingState } from '../../ui/States';
import { useCloseItem, useSelectedDay } from './useInspectionsNav';
import { useIrAccess, type IrJob } from './useIrAccess';
import { FLEXIBLE, TIME_OPTIONS, isDay, minutesOf, requestDay } from './time';

const SLOTS = TIME_OPTIONS.filter((o) => o.value !== FLEXIBLE);

function BlockFields({ job, day, onDone }: { job: IrJob; day: string; onDone?: (() => void) | undefined }) {
  const add = useAddBlock();
  const close = useCloseItem(job.id);
  const [date, setDate] = useState(requestDay(day, todayInZone(job.tz)));
  const [allDay, setAllDay] = useState(false);
  const [from, setFrom] = useState('12:00');
  const [to, setTo] = useState('13:00');
  const [weekly, setWeekly] = useState(false);
  const [until, setUntil] = useState('');
  const badTimes = !allDay && minutesOf(to) <= minutesOf(from);

  return (
    <form
      className="flex flex-col gap-3 p-4"
      data-testid="ir-block-form"
      onSubmit={(e) => {
        e.preventDefault();
        if (badTimes || !isDay(date)) return;
        add.mutate(
          {
            projectId: job.id,
            orgId: job.orgId,
            date,
            startTime: allDay ? null : from,
            endTime: allDay ? null : to,
            weekly,
            until: weekly && until !== '' ? until : null,
          },
          { onSuccess: onDone ?? close },
        );
      }}
    >
      <TextField label="Day" type="date" value={date} onChange={setDate} />
      <CheckField label="All day" checked={allDay} onChange={setAllDay} />
      {allDay ? null : (
        <div className="grid grid-cols-2 gap-3">
          <SelectField label="From" value={from} options={SLOTS} onChange={setFrom} />
          <SelectField label="To" value={to} options={SLOTS} onChange={setTo} />
        </div>
      )}
      {badTimes ? <p className="text-sm text-danger">End after the start.</p> : null}
      <CheckField label="Every week" checked={weekly} onChange={setWeekly} />
      {weekly ? <TextField label="Until" type="date" value={until} onChange={setUntil} /> : null}
      {add.isError ? <p className="text-sm text-danger">{messageOf(add.error)}</p> : null}
      <div className="flex justify-end">
        <Button type="submit" variant="primary" icon={CalendarOff} disabled={badTimes || !isDay(date)} loading={add.isPending}>
          Block
        </Button>
      </div>
    </form>
  );
}

export function BlockForm({ projectId, onDone }: { projectId: string; onDone?: (() => void) | undefined }) {
  const access = useIrAccess(projectId);
  const zone = access.state === 'ready' ? access.job.tz : 'UTC';
  const day = useSelectedDay(todayInZone(zone));
  if (access.state === 'error') return <ErrorState error={access.error} onRetry={access.retry} />;
  if (access.state === 'loading') return <LoadingState label="Loading" />;
  if (!access.can.decide) return <ErrorState error={new Error('Only inspectors block time.')} />;
  return <BlockFields key={projectId} job={access.job} day={day} onDone={onDone} />;
}
