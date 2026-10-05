// Today's report on the job, on the form I write here (work log or a company form): the day, the number and state, the
// main button (Start / Continue / Edit submitted), the phone's one-tap Camera that puts photos straight on today's
// report (a failed upload says so here, with Retry; a photo added to a submitted report says it needs resubmitting),
// the earlier drafts not yet submitted, and "Past date".
import { useState } from 'react';
import { PenLine, RotateCw } from 'lucide-react';
import type { Json } from '../../data/database.types';
import { useAddDailyPhotos, useCreateDailyReport, useDailyPhotoUploads, type PhotoPick } from '../../data/dailies.mutations';
import { useMyDailies, useNextDailyNumber, useTodaysDraft } from '../../data/dailies.queries';
import { messageOf } from '../../data/errors';
import type { ProjectRow } from '../../data/types';
import { formatDay, todayInZone } from '../../lib/dates';
import { Button } from '../../ui/Button';
import { Card } from '../../ui/Card';
import { ErrorState, LoadingState } from '../../ui/States';
import { StatusChip } from '../../ui/StatusChip';
import { useToast } from '../../ui/Toast';
import { TODAY_LABELS, earlierDrafts, numberLabel, todayAction, todayChip } from './model';
import { PhotoButtons } from './PhotoButtons';
import { useDailyForm } from './useDailyForm';

interface TodayCardProps {
  project: ProjectRow;
  isPhone: boolean;
  onOpen: (reportId: string) => void;
}

const DATE_INPUT =
  'h-9 rounded-md border border-line-strong bg-card px-2.5 text-sm text-ink outline-none focus:border-accent';

function Loading() {
  return (
    <Card>
      <LoadingState label="Loading today" />
    </Card>
  );
}

interface TodayProps extends TodayCardProps {
  reportType: string;
  settingsIfNew: Json;
}

function Today({ project, reportType, settingsIfNew, isPhone, onOpen }: TodayProps) {
  const projectId = project.id;
  const tz = project.timezone;
  const today = todayInZone(tz);
  const ensured = useTodaysDraft(projectId, reportType, settingsIfNew, true);
  const mine = useMyDailies(projectId, true);
  const next = useNextDailyNumber(projectId, reportType, true);
  const create = useCreateDailyReport(projectId);
  const addPhotos = useAddDailyPhotos(projectId);
  const uploads = useDailyPhotoUploads(projectId);
  const toast = useToast();
  const [pastDate, setPastDate] = useState('');
  const [problem, setProblem] = useState<string | null>(null);
  const [onSubmitted, setOnSubmitted] = useState<string | null>(null);

  if (ensured.isPending || mine.isPending) return <Loading />;
  if (ensured.isError) return <ErrorState error={ensured.error} onRetry={() => void ensured.refetch()} />;
  if (mine.isError) return <ErrorState error={mine.error} onRetry={() => void mine.refetch()} />;

  const todays = mine.data.find((r) => r.report_date === today && r.report_type === reportType) ?? null;
  const action = todayAction(todays);
  const earlier = earlierDrafts(mine.data, today);
  const fail = (e: unknown) => {
    toast.show({ tone: 'error', message: messageOf(e) });
  };
  const open = (reportDate: string): Promise<string> => create.mutateAsync({ reportType, reportDate });
  const todaysId = (): Promise<string> => (todays ? Promise.resolve(todays.id) : open(today));

  function photos(picks: PhotoPick[]) {
    setProblem(null);
    todaysId().then(
      (reportId) => {
        addPhotos.mutate(
          { picks, target: { reportId, rowKey: null } },
          {
            onSuccess: () => {
              // A submitted report with a new photo needs resubmitting: say so here, with the way there.
              setOnSubmitted(todays?.status === 'submitted' ? reportId : null);
              toast.show({ message: `Uploading ${String(picks.length)} to today's report.` });
            },
            onError: (e) => {
              setProblem(`Photo not added: ${messageOf(e)}`);
            },
          },
        );
      },
      (e: unknown) => {
        setProblem(`Photo not added: ${messageOf(e)}`);
      },
    );
  }
  const failed = uploads.items.filter((i) => i.status === 'failed');

  return (
    <Card>
      <div className="flex flex-col gap-4" data-testid="daily-today-card">
        <div className={isPhone ? 'flex flex-col gap-4' : 'flex items-end justify-between gap-6'}>
          <div className="min-w-0">
            <p className="text-xs font-medium uppercase tracking-wide text-ink-3">Today</p>
            <p className="text-[26px] font-semibold leading-8 tracking-[-0.015em] text-ink">{formatDay(today, 'EEEE, MMM d')}</p>
            <p className="mt-1 flex flex-wrap items-center gap-2 text-sm">
              <span className="font-medium tabular-nums text-ink-2">{numberLabel(todays?.number ?? null, next.data)}</span>
              <span data-testid="daily-today-chip">
                <StatusChip {...todayChip(todays)} />
              </span>
            </p>
          </div>
          <div className="flex gap-2">
            <Button
              variant="primary"
              icon={PenLine}
              className={`h-12 text-base ${isPhone ? 'flex-1' : 'min-w-52 px-6'}`}
              loading={create.isPending}
              data-testid="daily-today"
              onClick={() => {
                todaysId().then(onOpen, fail);
              }}
            >
              {TODAY_LABELS[action]}
            </Button>
            {isPhone ? <PhotoButtons variant="hero" projectName={project.name} tz={tz} onPicked={photos} testId="daily-quick-camera" /> : null}
          </div>
        </div>

        {problem !== null ? (
          <p role="alert" className="text-sm text-danger" data-testid="daily-today-problem">
            {problem}
          </p>
        ) : null}
        {failed.map((f) => (
          <p key={f.key} role="alert" className="flex items-center gap-2 text-sm text-danger" data-testid="daily-today-failed">
            <span className="min-w-0 flex-1 break-words">
              {f.name}: {f.error ?? 'Upload failed'}
            </span>
            <Button
              size="sm"
              icon={RotateCw}
              onClick={() => {
                uploads.retry(f.key);
              }}
            >
              Retry
            </Button>
          </p>
        ))}
        {onSubmitted !== null ? (
          <p className="flex flex-wrap items-center gap-2 text-sm text-ink-2" data-testid="daily-today-resubmit">
            Added to a submitted report.
            <Button
              size="sm"
              onClick={() => {
                onOpen(onSubmitted);
              }}
            >
              Update & resubmit
            </Button>
          </p>
        ) : null}

        {earlier.length > 0 ? (
          <div className="flex flex-wrap items-center gap-2 text-sm" data-testid="daily-earlier">
            <span className="text-ink-2">Not submitted</span>
            {earlier.map((r) => (
              <button
                key={r.id}
                type="button"
                className="inline-flex h-9 items-center rounded-full border border-line-strong bg-card px-3 text-[13px] font-medium text-ink shadow-control hover:border-accent hover:text-accent"
                onClick={() => {
                  onOpen(r.id);
                }}
              >
                {formatDay(r.report_date, 'EEE, MMM d')}
              </button>
            ))}
          </div>
        ) : null}

        <form
          className="-mx-4 -mb-4 flex flex-wrap items-center gap-2 rounded-b-card border-t border-line bg-card-head px-4 py-2.5"
          onSubmit={(e) => {
            e.preventDefault();
            if (pastDate !== '') open(pastDate).then(onOpen, fail);
          }}
        >
          <label className="flex items-center gap-2 text-sm text-ink-2">
            Past date
            <input
              type="date"
              max={today}
              className={DATE_INPUT}
              value={pastDate}
              data-testid="daily-past-date"
              onChange={(e) => {
                setPastDate(e.target.value);
              }}
            />
          </label>
          <Button type="submit" size="sm" disabled={pastDate === '' || pastDate > today}>
            Open
          </Button>
        </form>
      </div>
    </Card>
  );
}

export function TodayCard(props: TodayCardProps) {
  const f = useDailyForm(props.project);
  if (f.status === 'pending') return <Loading />;
  if (f.status === 'error') return <ErrorState error={f.error} onRetry={f.retry} />;
  return <Today {...props} reportType={f.reportType} settingsIfNew={f.settingsFor(f.reportType)} />;
}
