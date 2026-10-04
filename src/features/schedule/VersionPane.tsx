// One published update (beside Updates): which one, current or superseded, its data date, where it came from, how
// many activities, who published it, and the original file (one click, the one download path).
import type { ReactNode } from 'react';
import { Download } from 'lucide-react';
import { messageOf } from '../../data/errors';
import { downloadScheduleFile } from '../../data/schedule.mutations';
import { useScheduleVersion } from '../../data/schedule.queries';
import { useMyProjects } from '../../data/queries';
import { formatDay, formatInZone } from '../../lib/dates';
import { Button } from '../../ui/Button';
import { ErrorState, LoadingState } from '../../ui/States';
import { useToast } from '../../ui/Toast';
import { VersionChip } from './UpdatesView';
import { sourceLabel, versionName } from './model';

interface VersionPaneProps {
  projectId: string;
  versionId: string;
}

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-[12px] font-medium uppercase tracking-[0.04em] text-ink-3">{label}</dt>
      <dd className="break-words text-[15px] text-ink">{children}</dd>
    </div>
  );
}

export function VersionPane({ projectId, versionId }: VersionPaneProps) {
  const version = useScheduleVersion(projectId, versionId);
  const jobs = useMyProjects();
  const toast = useToast();
  const zone = jobs.data?.find((p) => p.project_id === projectId)?.timezone;
  if (version.isError) return <ErrorState error={version.error} onRetry={() => void version.refetch()} />;
  if (jobs.isError) return <ErrorState error={jobs.error} onRetry={() => void jobs.refetch()} />;
  if (!version.data || zone === undefined) return <LoadingState label="Loading the update" />;
  const v = version.data;
  const fileId = v.file_id;
  return (
    <div className="flex min-h-full flex-col" data-testid="schedule-version">
      <div className="flex flex-1 flex-col gap-5 px-5 py-4">
        <header className="flex flex-col gap-1">
          <div className="flex items-center justify-between gap-3">
            <span className="text-[13px] font-semibold uppercase tracking-[0.04em] text-ink-3">{versionName(v)}</span>
            <VersionChip status={v.status} />
          </div>
          <h1 className="break-words text-[19px] font-semibold leading-7 tracking-[-0.01em] text-ink">{v.title ?? v.file_name ?? versionName(v)}</h1>
        </header>
        <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
          <Fact label="Data date">{v.data_date ? formatDay(v.data_date, 'EEE, MMM d, yyyy') : 'None'}</Fact>
          <Fact label="Activities">{v.activities}</Fact>
          <Fact label="From">{sourceLabel(v.source_kind)}</Fact>
          {v.published_at ? (
            <Fact label="Published">
              {formatInZone(v.published_at, zone, 'MMM d, h:mm a')}
              {v.published_by_name ? ` · ${v.published_by_name}` : ''}
            </Fact>
          ) : null}
        </dl>
      </div>
      {fileId ? (
        <div className="border-t border-line px-5 py-3">
          <Button
            icon={Download}
            data-testid="schedule-version-download"
            onClick={() => {
              downloadScheduleFile(fileId).catch((e: unknown) => {
                toast.show({ message: messageOf(e), tone: 'error' });
              });
            }}
          >
            {v.file_name ?? 'Download'}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
