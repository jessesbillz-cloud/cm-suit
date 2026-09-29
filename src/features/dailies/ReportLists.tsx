// The report lists: mine (drafts and submitted, newest day first) and, for dailies.read_all, the team's submitted
// reports with the signed PDF one click away. One row per report: number, day, (author), status, open.
import { useState } from 'react';
import { ChevronRight, Download } from 'lucide-react';
import { useMyDailies, useTeamDailies } from '../../data/dailies.queries';
import type { DailyReportRow } from '../../data/dailies.types';
import { downloadErrorMessage, downloadFile } from '../../data/download';
import { dailyHeaderSchema } from '../../lib/dailies';
import { formatDay } from '../../lib/dates';
import { Card } from '../../ui/Card';
import { Icon } from '../../ui/Icon';
import { Segments } from '../../ui/Segments';
import { EmptyState, ErrorState, LoadingState } from '../../ui/States';
import { StatusChip } from '../../ui/StatusChip';
import { useToast } from '../../ui/Toast';
import { TOOL_META } from '../../ui/tools';
import { reportChip } from './model';
import { useDailiesNav, type DailiesView } from './useDailiesNav';

const ROW = 'group flex min-h-[52px] w-full items-center gap-3 px-4 py-2 text-left text-sm';
const HOVER = 'cursor-pointer hover:bg-page/60';
/** The row open in the right column: a soft accent fill and a 3px accent edge on the left. */
const SELECTED = 'bg-accent-soft/60 shadow-[inset_3px_0_0_theme(colors.accent.DEFAULT)]';
const NUMBER = 'w-10 shrink-0 font-medium tabular-nums text-ink';

function Chevron() {
  return <Icon icon={ChevronRight} size={16} className="shrink-0 text-ink-3 group-hover:text-ink-2" />;
}

interface ListProps {
  projectId: string;
  selectedId: string | null;
  onOpen: (id: string) => void;
}

function MyList({ projectId, selectedId, onOpen }: ListProps) {
  const mine = useMyDailies(projectId, true);
  if (mine.isPending) return <LoadingState label="Loading reports" />;
  if (mine.isError) return <ErrorState error={mine.error} onRetry={() => void mine.refetch()} />;
  if (mine.data.length === 0) return <EmptyState icon={TOOL_META.dailies.icon} title="No reports yet." />;
  return (
    <ul className="divide-y divide-line">
      {mine.data.map((r) => {
        const chip = reportChip(r);
        const selected = r.id === selectedId;
        return (
          <li key={r.id}>
            <button
              type="button"
              data-testid="daily-row"
              aria-current={selected || undefined}
              className={`${ROW} ${selected ? SELECTED : HOVER}`}
              onClick={() => {
                onOpen(r.id);
              }}
            >
              <span className={NUMBER}>{r.number === null ? '' : `#${String(r.number)}`}</span>
              <span className="min-w-0 flex-1 font-medium text-ink">{formatDay(r.report_date, 'EEE, MMM d')}</span>
              <StatusChip status={chip.status} label={chip.label} />
              <Chevron />
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
  const chip = reportChip(row);
  const fileId = row.pdf_file_id;
  return (
    <li className={`flex items-center ${selected ? SELECTED : 'hover:bg-page/60'}`}>
      <button
        type="button"
        data-testid="daily-team-row"
        aria-current={selected || undefined}
        className={`${ROW} min-w-0 flex-1 cursor-pointer pr-2`}
        onClick={() => {
          onOpen(row.id);
        }}
      >
        <span className={NUMBER}>#{row.number}</span>
        <span className="flex min-w-0 flex-1 flex-col sm:flex-row sm:items-center sm:gap-3">
          <span className="font-medium text-ink sm:w-32 sm:shrink-0">{formatDay(row.report_date, 'EEE, MMM d')}</span>
          <span className="break-words text-[13px] text-ink-2 sm:text-sm">{author}</span>
        </span>
        <StatusChip status={chip.status} label={chip.label} />
      </button>
      {fileId === null ? null : (
        <button
          type="button"
          aria-label={`Download ${row.filename ?? 'report'}`}
          title="Download"
          disabled={busy}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md text-ink-2 hover:bg-card hover:text-accent disabled:text-ink-3"
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
      <span className="pr-4">
        <Chevron />
      </span>
    </li>
  );
}

function TeamList({ projectId, selectedId, onOpen }: ListProps) {
  const team = useTeamDailies(projectId, true);
  if (team.isPending) return <LoadingState label="Loading reports" />;
  if (team.isError) return <ErrorState error={team.error} onRetry={() => void team.refetch()} />;
  if (team.data.length === 0) return <EmptyState icon={TOOL_META.dailies.icon} title="No submitted reports yet." />;
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
    <Card
      padded={false}
      className="overflow-hidden"
      title="Reports"
      actions={canWrite && canReadAll ? <Segments label="Reports" options={VIEWS} value={view} onPick={nav.setView} testId="dailies-view" /> : undefined}
    >
      {view === 'mine' ? (
        <MyList projectId={projectId} selectedId={selectedId} onOpen={nav.open} />
      ) : (
        <TeamList projectId={projectId} selectedId={selectedId} onOpen={nav.open} />
      )}
    </Card>
  );
}
