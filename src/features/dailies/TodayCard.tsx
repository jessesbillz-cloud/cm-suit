// Today's report on the job: the main button (Start / Continue / Edit submitted), the phone's one-tap Camera that
// puts photos straight on today's report, the earlier drafts not yet submitted, and "Past date".
import { useState } from 'react';
import { useAddDailyPhotos, useCreateDailyReport, type PhotoPick } from '../../data/dailies.mutations';
import { useMyDailies, useNextDailyNumber, useTodaysDraft } from '../../data/dailies.queries';
import { messageOf } from '../../data/errors';
import { formatDay, todayInZone } from '../../lib/dates';
import { Button } from '../../ui/Button';
import { ErrorState, LoadingState } from '../../ui/States';
import { StatusChip } from '../../ui/StatusChip';
import { useToast } from '../../ui/Toast';
import { TODAY_LABELS, earlierDrafts, numberLabel, reportChip, todayAction } from './model';
import { PhotoButtons } from './PhotoButtons';

interface TodayCardProps {
  projectId: string;
  projectName: string;
  tz: string;
  isPhone: boolean;
  onOpen: (reportId: string) => void;
}

export function TodayCard({ projectId, projectName, tz, isPhone, onOpen }: TodayCardProps) {
  const today = todayInZone(tz);
  const ensured = useTodaysDraft(projectId, true);
  const mine = useMyDailies(projectId, true);
  const next = useNextDailyNumber(projectId, true);
  const create = useCreateDailyReport(projectId);
  const addPhotos = useAddDailyPhotos(projectId);
  const toast = useToast();
  const [pastDate, setPastDate] = useState('');

  if (ensured.isPending || mine.isPending) return <LoadingState label="Loading today" />;
  if (ensured.isError) return <ErrorState error={ensured.error} onRetry={() => void ensured.refetch()} />;
  if (mine.isError) return <ErrorState error={mine.error} onRetry={() => void mine.refetch()} />;

  const todays = mine.data.find((r) => r.report_date === today) ?? null;
  const action = todayAction(todays);
  const earlier = earlierDrafts(mine.data, today);
  const fail = (e: unknown) => {
    toast.show({ tone: 'error', message: messageOf(e) });
  };
  const todaysId = (): Promise<string> => (todays ? Promise.resolve(todays.id) : create.mutateAsync(today));

  function photos(picks: PhotoPick[]) {
    todaysId().then((reportId) => {
      addPhotos.mutate({ picks, target: { reportId, rowKey: null } }, { onError: fail });
      toast.show({ message: `Uploading ${String(picks.length)} to today's report.` });
    }, fail);
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="flex flex-wrap items-center gap-2 text-sm text-ink-2">
        <span className="font-medium text-ink">{formatDay(today, 'EEE, MMM d')}</span>
        <span className="tabular-nums">{numberLabel(todays?.number ?? null, next.data)}</span>
        {todays ? <StatusChip {...reportChip(todays)} /> : null}
      </p>
      <div className="flex gap-2">
        <Button
          variant="primary"
          className="h-12 flex-1 text-base"
          loading={create.isPending}
          data-testid="daily-today"
          onClick={() => {
            todaysId().then(onOpen, fail);
          }}
        >
          {TODAY_LABELS[action]}
        </Button>
        {isPhone ? <PhotoButtons cameraOnly projectName={projectName} tz={tz} onPicked={photos} testId="daily-quick-camera" /> : null}
      </div>
      {earlier.length > 0 ? (
        <p className="flex flex-wrap items-center gap-x-2 text-sm" data-testid="daily-earlier">
          <span className="text-ink-2">Not submitted:</span>
          {earlier.map((r) => (
            <button
              key={r.id}
              type="button"
              className="text-accent underline-offset-2 hover:underline"
              onClick={() => {
                onOpen(r.id);
              }}
            >
              {formatDay(r.report_date, 'MMM d')}
            </button>
          ))}
        </p>
      ) : null}
      <form
        className="flex items-end gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (pastDate !== '') create.mutate(pastDate, { onSuccess: onOpen, onError: fail });
        }}
      >
        <label className="flex flex-col gap-1 text-xs font-medium text-ink-2">
          Past date
          <input
            type="date"
            max={today}
            className="h-9 rounded-md border border-line bg-card px-2.5 text-sm font-normal text-ink outline-none focus:border-accent"
            value={pastDate}
            data-testid="daily-past-date"
            onChange={(e) => {
              setPastDate(e.target.value);
            }}
          />
        </label>
        <Button type="submit" disabled={pastDate === '' || pastDate > today}>
          Open
        </Button>
      </form>
    </div>
  );
}
