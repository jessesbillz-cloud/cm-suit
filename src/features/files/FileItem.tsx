// A file opened in the right column (or its own window): what it is, its scan state, Download, Open in new window.
// The page-by-page viewer (pdf.js) arrives in Phase 2 (SPEC §12).
import { useFile } from '../../data/queries';
import { useUser } from '../../data/auth';
import { formatInZone } from '../../lib/dates';
import { formatBytes } from '../../lib/format';
import { fileIcon } from '../../ui/fileIcon';
import { Icon } from '../../ui/Icon';
import { ReadingPane } from '../../ui/ReadingPane';
import { EmptyState, ErrorState, LoadingState } from '../../ui/States';
import { StatusChip } from '../../ui/StatusChip';
import { useProjectZones } from '../board/zones';
import { opensBeforeScan, scanChip } from './scanStatus';
import { useDownload } from './useDownload';

interface FileItemProps {
  fileId: string;
  onOpenWindow?: (() => void) | undefined;
}

function scanNotice(scan: string, mine: boolean, photo: boolean): string | null {
  if (scan === 'pending' && !photo) {
    return mine
      ? 'Scanning for viruses. Until the scan finishes, only you can download it.'
      : 'Scanning for viruses. It can be downloaded when the scan finishes.';
  }
  if (scan === 'infected') return 'The virus scan found a problem. Downloads are blocked and the project admin has been told.';
  if (scan === 'too_large_to_scan') return 'This file is too large for the virus scanner. It was not marked clean.';
  return null;
}

export function FileItem({ fileId, onOpenWindow }: FileItemProps) {
  const file = useFile(fileId);
  const user = useUser();
  const zoneOf = useProjectZones();
  const download = useDownload();

  if (file.isPending) return <LoadingState />;
  if (file.isError) return <ErrorState error={file.error} onRetry={() => void file.refetch()} />;
  if (file.data === null) return <EmptyState title="This file is no longer here, or you no longer have access." />;

  const f = file.data;
  const chip = scanChip(f.scan_status, f.upload_complete);
  const notice = scanNotice(f.scan_status, f.created_by === user.id, opensBeforeScan(f.mime, f.original_name));
  const canDownload = f.upload_complete && f.scan_status !== 'infected';

  return (
    <ReadingPane
      eyebrow={
        <>
          <Icon icon={fileIcon(f.original_name, f.mime)} size={16} className="text-accent" />
          <StatusChip status={chip.status} label={chip.label} />
        </>
      }
      title={f.original_name}
      meta={`${formatBytes(f.size)} · added ${formatInZone(f.created_at, zoneOf(f.project_id), 'MMM d, yyyy h:mm a')}`}
      onOpenWindow={onOpenWindow}
      onDownload={
        canDownload
          ? () => {
              download.start(f.id, f.size);
            }
          : undefined
      }
      downloading={download.pendingId === f.id}
    >
      {notice ? (
        <p
          role={f.scan_status === 'infected' ? 'alert' : undefined}
          className={`rounded-lg border px-3.5 py-2.5 ${
            f.scan_status === 'infected' ? 'border-danger/30 bg-danger-soft text-danger' : 'border-line bg-card-head text-ink-2'
          }`}
        >
          {notice}
        </p>
      ) : null}
    </ReadingPane>
  );
}
