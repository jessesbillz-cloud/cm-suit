// The report lists: mine (drafts and submitted, newest day first) and, for dailies.read_all, the team's submitted
// reports. A row with a signed PDF has it one click away (Full screen, Download), in both lists. One row per report:
// number, day, (author), status, open.
import { ChevronRight, Download, Maximize2 } from 'lucide-react';
import { useMyDailies, useTeamDailies } from '../../data/dailies.queries';
import type { DailyReportRow } from '../../data/dailies.types';
import { usePreviewFetch } from '../../data/preview';
import { dailyHeaderSchema } from '../../lib/dailies';
import { formatDay } from '../../lib/dates';
import { Card } from '../../ui/Card';
import { useFileViewer, type ViewerItem } from '../../ui/FileViewer';
import { Icon } from '../../ui/Icon';
import { Segments } from '../../ui/Segments';
import { EmptyState, ErrorState, LoadingState } from '../../ui/States';
import { StatusChip } from '../../ui/StatusChip';
import { TOOL_META } from '../../ui/tools';
import { useDownload } from '../files/useDownload';
import { pdfOffer, reportChip } from './model';
import { dailyPdfItem } from './pdfItem';
import { useDailiesNav, type DailiesView } from './useDailiesNav';

const ROW = 'group flex min-h-[52px] w-full items-center gap-3 px-4 py-2 text-left text-sm';
/** The row open in the right column: a soft accent fill and a 3px accent edge on the left. */
const SELECTED = 'bg-accent-soft/60 shadow-[inset_3px_0_0_theme(colors.accent.DEFAULT)]';
const NUMBER = 'w-10 shrink-0 font-medium tabular-nums text-ink';
const ROW_ICON =
  'flex h-10 w-10 shrink-0 items-center justify-center rounded-md text-ink hover:bg-card hover:text-accent disabled:text-ink-3/50';

type DownloadState = ReturnType<typeof useDownload>;

function Chevron() {
  return <Icon icon={ChevronRight} size={16} className="shrink-0 text-ink-2 group-hover:text-ink" />;
}

interface ListProps {
  projectId: string;
  selectedId: string | null;
  onOpen: (id: string) => void;
}

interface PdfButtonsProps {
  row: DailyReportRow;
  fileId: string;
  download: DownloadState;
  onView: () => void;
  testPrefix: string;
}

/** The report's signed PDF from its row, each one click: Full screen and Download. */
function PdfButtons({ row, fileId, download, onView, testPrefix }: PdfButtonsProps) {
  // A changed report's stored PDF is the signed copy, never offered as current: it says so.
  const signedOnly = pdfOffer(row, false) === 'signed';
  return (
    <>
      <button
        type="button"
        aria-label={`${signedOnly ? 'Full screen signed copy' : 'Full screen'} ${row.filename ?? 'report'}`}
        title={signedOnly ? 'Changed since signed. Full screen the signed copy.' : 'Full screen'}
        data-testid={`${testPrefix}-view`}
        className={ROW_ICON}
        onClick={onView}
      >
        <Icon icon={Maximize2} size={18} />
      </button>
      <button
        type="button"
        aria-label={`${signedOnly ? 'Download signed copy' : 'Download'} ${row.filename ?? 'report'}`}
        title={signedOnly ? 'Changed since signed. Download the signed copy.' : 'Download'}
        disabled={download.pendingId === fileId}
        data-testid={`${testPrefix}-download`}
        className={ROW_ICON}
        onClick={() => {
          download.start(fileId);
        }}
      >
        <Icon icon={Download} size={18} />
      </button>
    </>
  );
}

function MyList({ projectId, selectedId, onOpen }: ListProps) {
  const mine = useMyDailies(projectId, true);
  const download = useDownload();
  const viewer = useFileViewer();
  const preview = usePreviewFetch();
  if (mine.isPending) return <LoadingState label="Loading reports" />;
  if (mine.isError) return <ErrorState error={mine.error} onRetry={() => void mine.refetch()} />;
  if (mine.data.length === 0) return <EmptyState icon={TOOL_META.dailies.icon} title="No reports yet." />;
  const items: ViewerItem[] = mine.data.flatMap((r) => (r.pdf_file_id === null ? [] : [dailyPdfItem(r, r.pdf_file_id, preview)]));
  return (
    <ul className="divide-y divide-line">
      {mine.data.map((r) => {
        const chip = reportChip(r);
        const selected = r.id === selectedId;
        const fileId = r.pdf_file_id;
        return (
          <li key={r.id} className={`flex items-center ${selected ? SELECTED : 'hover:bg-page/60'}`}>
            <button
              type="button"
              data-testid="daily-row"
              aria-current={selected || undefined}
              className={`${ROW} min-w-0 flex-1 cursor-pointer pr-2`}
              onClick={() => {
                onOpen(r.id);
              }}
            >
              <span className={NUMBER}>{r.number === null ? '' : `#${String(r.number)}`}</span>
              <span className="min-w-0 flex-1 font-medium text-ink">{formatDay(r.report_date, 'EEE, MMM d')}</span>
              <StatusChip status={chip.status} label={chip.label} />
            </button>
            {fileId === null ? null : (
              <PdfButtons
                row={r}
                fileId={fileId}
                download={download}
                testPrefix="daily-row"
                onView={() => {
                  viewer.open(
                    items,
                    items.findIndex((i) => i.id === fileId),
                  );
                }}
              />
            )}
            <span className="pr-4">
              <Chevron />
            </span>
          </li>
        );
      })}
    </ul>
  );
}

interface TeamRowProps {
  row: DailyReportRow;
  selected: boolean;
  onOpen: (id: string) => void;
  download: DownloadState;
  /** The PDF full screen (only with a PDF). */
  onView: () => void;
}

function TeamRow({ row, selected, onOpen, download, onView }: TeamRowProps) {
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
          <span className="min-w-0 wrap-anywhere text-[13px] text-ink-2 sm:text-sm">{author}</span>
        </span>
        <StatusChip status={chip.status} label={chip.label} />
      </button>
      {fileId === null ? null : (
        <PdfButtons row={row} fileId={fileId} download={download} onView={onView} testPrefix="daily-team" />
      )}
      <span className="pr-4">
        <Chevron />
      </span>
    </li>
  );
}

function TeamList({ projectId, selectedId, onOpen }: ListProps) {
  const team = useTeamDailies(projectId, true);
  const download = useDownload();
  const viewer = useFileViewer();
  const preview = usePreviewFetch();
  if (team.isPending) return <LoadingState label="Loading reports" />;
  if (team.isError) return <ErrorState error={team.error} onRetry={() => void team.refetch()} />;
  if (team.data.length === 0) return <EmptyState icon={TOOL_META.dailies.icon} title="No submitted reports yet." />;
  // The viewer walks the listed PDFs, as the rows show them.
  const items: ViewerItem[] = team.data.flatMap((r) => (r.pdf_file_id === null ? [] : [dailyPdfItem(r, r.pdf_file_id, preview)]));
  return (
    <ul className="divide-y divide-line">
      {team.data.map((r) => (
        <TeamRow
          key={r.id}
          row={r}
          selected={r.id === selectedId}
          onOpen={onOpen}
          download={download}
          onView={() => {
            viewer.open(
              items,
              items.findIndex((i) => i.id === r.pdf_file_id),
            );
          }}
        />
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
