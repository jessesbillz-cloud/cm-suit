// The report lists: mine (drafts and submitted, newest day first) and, for dailies.read_all, the team's submitted
// reports with the signed PDF one click away.
import { useState } from 'react';
import { Download } from 'lucide-react';
import { useMyDailies, useTeamDailies } from '../../data/dailies.queries';
import type { DailyReportRow } from '../../data/dailies.types';
import { downloadErrorMessage, downloadFile } from '../../data/download';
import { dailyHeaderSchema } from '../../lib/dailies';
import { formatDay } from '../../lib/dates';
import { Icon } from '../../ui/Icon';
import { EmptyState, ErrorState, LoadingState } from '../../ui/States';
import { StatusChip } from '../../ui/StatusChip';
import { useToast } from '../../ui/Toast';
import { numberLabel, reportChip } from './model';
import { useDailiesNav, type DailiesView } from './useDailiesNav';

const ROW = 'flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm';

interface ListProps {
  projectId: string;
  selectedId: string | null;
  onOpen: (id: string) => void;
}

function MyList({ projectId, selectedId, onOpen }: ListProps) {
  const mine = useMyDailies(projectId, true);
  if (mine.isPending) return <LoadingState label="Loading reports" />;
  if (mine.isError) return <ErrorState error={mine.error} onRetry={() => void mine.refetch()} />;
  if (mine.data.length === 0) return <EmptyState title="No reports yet." />;
  return (
    <ul className="divide-y divide-line">
      {mine.data.map((r) => {
        const chip = reportChip(r);
        return (
          <li key={r.id}>
            <button
              type="button"
              data-testid="daily-row"
              aria-current={r.id === selectedId || undefined}
              className={`${ROW} hover:bg-page ${r.id === selectedId ? 'bg-accent-soft' : ''}`}
              onClick={() => {
                onOpen(r.id);
              }}
            >
              <span className="w-28 shrink-0 font-medium text-ink">{formatDay(r.report_date, 'EEE, MMM d')}</span>
              <span className="min-w-0 flex-1 tabular-nums text-ink-2">{numberLabel(r.number, undefined)}</span>
              <StatusChip status={chip.status} label={chip.label} />
            </button>
          </li>
        );
      })}
    </ul>
  );
}

function TeamRow({ row, selected, onOpen }: { row: DailyReportRow; selected: boolean; onOpen: (id: string) => void }) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const header = dailyHeaderSchema.safeParse(row.header);
  const author = header.success ? header.data.author_name : '';
  const fileId = row.pdf_file_id;
  return (
    <li className={`flex items-center ${selected ? 'bg-accent-soft' : ''}`}>
      <button
        type="button"
        data-testid="daily-team-row"
        className={`${ROW} min-w-0 flex-1 hover:bg-page`}
        onClick={() => {
          onOpen(row.id);
        }}
      >
        <span className="w-28 shrink-0 font-medium text-ink">{formatDay(row.report_date, 'EEE, MMM d')}</span>
        <span className="min-w-0 flex-1 break-words text-ink">{author}</span>
        {row.version !== row.signed_version ? <StatusChip status="postponed" label="Changed" /> : null}
        <span className="tabular-nums text-ink-2">#{row.number}</span>
      </button>
      {fileId === null ? null : (
        <button
          type="button"
          aria-label={`Download ${row.filename ?? 'report'}`}
          disabled={busy}
          className="mr-2 flex h-9 w-9 items-center justify-center rounded-md text-ink-2 hover:bg-page hover:text-ink disabled:text-ink-3"
          onClick={() => {
            setBusy(true);
            downloadFile(fileId)
              .catch((e: unknown) => {
                toast.show({ tone: 'error', message: downloadErrorMessage(e) });
              })
              .finally(() => {
                setBusy(false);
              });
          }}
        >
          <Icon icon={Download} size={18} />
        </button>
      )}
    </li>
  );
}

function TeamList({ projectId, selectedId, onOpen }: ListProps) {
  const team = useTeamDailies(projectId, true);
  if (team.isPending) return <LoadingState label="Loading reports" />;
  if (team.isError) return <ErrorState error={team.error} onRetry={() => void team.refetch()} />;
  if (team.data.length === 0) return <EmptyState title="No submitted reports yet." />;
  return (
    <ul className="divide-y divide-line">
      {team.data.map((r) => (
        <TeamRow key={r.id} row={r} selected={r.id === selectedId} onOpen={onOpen} />
      ))}
    </ul>
  );
}

const VIEWS: { value: DailiesView; label: string }[] = [
  { value: 'mine', label: 'Mine' },
  { value: 'team', label: 'Team' },
];

interface ReportListsProps {
  projectId: string;
  canWrite: boolean;
  canReadAll: boolean;
  selectedId: string | null;
}

export function ReportLists({ projectId, canWrite, canReadAll, selectedId }: ReportListsProps) {
  const nav = useDailiesNav(projectId);
  const view: DailiesView = !canWrite ? 'team' : !canReadAll ? 'mine' : nav.view;
  return (
    <section>
      {canWrite && canReadAll ? (
        <div role="tablist" aria-label="Reports" className="m-3 inline-flex rounded-md border border-line bg-card p-0.5">
          {VIEWS.map((v) => (
            <button
              key={v.value}
              type="button"
              role="tab"
              aria-selected={v.value === view}
              data-testid={`dailies-view-${v.value}`}
              className={`h-8 rounded px-3 text-sm ${v.value === view ? 'bg-accent-soft font-medium text-accent' : 'text-ink-2 hover:text-ink'}`}
              onClick={() => {
                nav.setView(v.value);
              }}
            >
              {v.label}
            </button>
          ))}
        </div>
      ) : null}
      {view === 'mine' ? (
        <MyList projectId={projectId} selectedId={selectedId} onOpen={nav.open} />
      ) : (
        <TeamList projectId={projectId} selectedId={selectedId} onOpen={nav.open} />
      )}
    </section>
  );
}
