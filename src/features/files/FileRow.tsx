// One file: its kind's icon, the name (wraps), size and date (muted), scan status, and ONE download button
// (data-testid="file-row-download"). On a phone, size and date fold into one line under the name.
import { Download } from 'lucide-react';
import type { FileRow as File } from '../../data/types';
import { formatInZone } from '../../lib/dates';
import { formatBytes } from '../../lib/format';
import { Button } from '../../ui/Button';
import { fileIcon } from '../../ui/fileIcon';
import { Icon } from '../../ui/Icon';
import { StatusChip } from '../../ui/StatusChip';
import { TH } from '../../ui/Table';
import { scanChip } from './scanStatus';

interface FileRowProps {
  file: File;
  /** The job's zone for the date; null while it loads (the date waits). */
  timeZone: string | null;
  selected: boolean;
  downloading: boolean;
  onOpen: (fileId: string) => void;
  onDownload: (file: File) => void;
}

const SIZE = 'w-20 shrink-0 text-right';
const DATE = 'w-28 shrink-0';
const ACTION = 'flex shrink-0 justify-end sm:w-[7.5rem]';

/** The column names over the rows (desktop only). */
export function FileRowsHead() {
  return (
    <div aria-hidden className={`hidden h-10 items-center gap-3 border-b border-line bg-card-head px-4 sm:flex ${TH}`}>
      <span className="w-8 shrink-0" />
      <span className="min-w-0 flex-1">Name</span>
      <span className={SIZE}>Size</span>
      <span className={DATE}>Added</span>
      <span className={ACTION} />
    </div>
  );
}

export function FileRow({ file, timeZone, selected, downloading, onOpen, onDownload }: FileRowProps) {
  const chip = scanChip(file.scan_status, file.upload_complete);
  const blocked = file.scan_status === 'infected' || !file.upload_complete;
  const added = timeZone === null ? '' : formatInZone(file.created_at, timeZone, 'MMM d, yyyy');
  const size = formatBytes(file.size);
  return (
    <li
      data-testid="file-row"
      aria-current={selected ? 'true' : undefined}
      className={`flex min-h-[56px] items-center gap-3 px-4 py-2 transition-colors ${
        selected ? 'bg-accent-soft/60 shadow-[inset_3px_0_0_theme(colors.accent.DEFAULT)]' : 'hover:bg-page/60'
      }`}
    >
      <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${selected ? 'bg-card text-accent' : 'bg-page text-ink-2'}`}>
        <Icon icon={fileIcon(file.original_name, file.mime)} size={16} />
      </span>
      <div className="flex min-w-0 flex-1 flex-col items-start gap-0.5">
        <button
          type="button"
          className="break-words text-left text-sm font-medium text-ink hover:text-accent hover:underline"
          onClick={() => {
            onOpen(file.id);
          }}
        >
          {file.original_name}
        </button>
        <span className="text-xs tabular-nums text-ink-3 sm:hidden">{[size, added].filter((s) => s !== '').join(' · ')}</span>
        {file.scan_status === 'clean' && file.upload_complete ? null : <StatusChip status={chip.status} label={chip.label} />}
      </div>
      <span className={`hidden text-xs tabular-nums text-ink-3 sm:block ${SIZE}`}>{size}</span>
      <span className={`hidden text-xs tabular-nums text-ink-3 sm:block ${DATE}`}>{added}</span>
      <span className={ACTION}>
        <Button
          size="sm"
          variant="secondary"
          icon={Download}
          data-testid="file-row-download"
          aria-label={`Download ${file.original_name}`}
          className="h-10 w-10 sm:h-8 sm:w-auto"
          loading={downloading}
          disabled={blocked}
          onClick={() => {
            onDownload(file);
          }}
        >
          <span className="hidden sm:inline">Download</span>
        </Button>
      </span>
    </li>
  );
}
