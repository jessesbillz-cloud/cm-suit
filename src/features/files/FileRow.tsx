// One file on one tight row: a tap on its name opens the file's pane; a tap on its icon (a photo or a PDF) opens it full
// screen; the download icon (data-testid="file-row-download") downloads it in one click. The name is never cut off: it wraps, even a long name with no spaces. Desktop: size and
// date sit on the name's line, right-aligned in columns. Phone: scan state, size and date make one short line under it.
import { Download } from 'lucide-react';
import { useUser } from '../../data/auth';
import type { FileRow as File } from '../../data/types';
import { formatInZone } from '../../lib/dates';
import { formatBytes } from '../../lib/format';
import { Button } from '../../ui/Button';
import { fileIcon } from '../../ui/fileIcon';
import { Icon } from '../../ui/Icon';
import { StatusChip } from '../../ui/StatusChip';
import { TH } from '../../ui/Table';
import { canOpenNow, scanChip } from './scanStatus';

interface FileRowProps {
  file: File;
  /** The job's zone for the date; null while it loads (the date waits). */
  timeZone: string | null;
  selected: boolean;
  downloading: boolean;
  onOpen: (fileId: string) => void;
  /** Full screen (photos and PDFs that may be opened now); left out, the icon opens the pane like the name. */
  onView?: (() => void) | undefined;
  onDownload: (file: File) => void;
}

const SIZE = 'w-16 shrink-0 text-right';
const DATE = 'w-[5.75rem] shrink-0 text-right';
/** The download icon's column: 32px on a desktop, 40px (a thumb's tap) on a phone. */
const ACTION = 'w-10 shrink-0 sm:w-8';

/** The column names over the rows (desktop only). */
export function FileRowsHead() {
  return (
    <div aria-hidden className={`hidden h-9 items-center gap-3 border-b border-line bg-card-head px-4 sm:flex ${TH}`}>
      <span className="min-w-0 flex-1 pl-11">Name</span>
      <span className={SIZE}>Size</span>
      <span className={DATE}>Added</span>
      <span className={ACTION} />
    </div>
  );
}

export function FileRow({ file, timeZone, selected, downloading, onOpen, onView, onDownload }: FileRowProps) {
  const user = useUser();
  const chip = file.scan_status === 'clean' && file.upload_complete ? null : scanChip(file.scan_status, file.upload_complete);
  // Unfinished, infected, or someone else's file still being scanned: nothing to download yet.
  const blocked = !canOpenNow(file, user.id);
  const iconBox = `flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${selected ? 'bg-card text-accent' : 'bg-page text-ink-2'}`;
  const added = timeZone === null ? '' : formatInZone(file.created_at, timeZone, 'MMM d, yyyy');
  const size = formatBytes(file.size);
  return (
    <li
      data-testid="file-row"
      aria-current={selected ? 'true' : undefined}
      className={`group flex items-center gap-3 px-4 transition-colors ${
        selected ? 'bg-accent-soft/60 shadow-[inset_3px_0_0_theme(colors.accent.DEFAULT)]' : 'hover:bg-page/60'
      }`}
    >
      {onView ? (
        <button
          type="button"
          data-testid="file-row-view"
          aria-label={`Full screen ${file.original_name}`}
          title="Full screen"
          className={`${iconBox} hover:bg-accent-soft hover:text-accent`}
          onClick={onView}
        >
          <Icon icon={fileIcon(file.original_name, file.mime)} size={16} />
        </button>
      ) : null}
      <button
        type="button"
        data-testid="file-row-open"
        className="flex min-h-[52px] min-w-0 flex-1 items-center gap-3 py-2 text-left"
        onClick={() => {
          onOpen(file.id);
        }}
      >
        {onView ? null : (
          <span className={iconBox}>
            <Icon icon={fileIcon(file.original_name, file.mime)} size={16} />
          </span>
        )}
        <span className="min-w-0 flex-1 text-sm leading-5">
          <span data-testid="file-row-name" className="wrap-anywhere font-medium text-ink group-hover:text-accent">
            {file.original_name}
          </span>
          {chip ? (
            <span className="ml-2 hidden align-middle sm:inline-block">
              <StatusChip status={chip.status} label={chip.label} />
            </span>
          ) : null}
          <span className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs tabular-nums text-ink-3 wrap-anywhere sm:hidden">
            {chip ? <StatusChip status={chip.status} label={chip.label} /> : null}
            {[size, added].filter((s) => s !== '').join(' · ')}
          </span>
        </span>
        <span className={`hidden text-xs tabular-nums text-ink-3 sm:block ${SIZE}`}>{size}</span>
        <span className={`hidden text-xs tabular-nums text-ink-3 sm:block ${DATE}`}>{added}</span>
      </button>
      <Button
        size="sm"
        variant="quiet"
        icon={Download}
        data-testid="file-row-download"
        aria-label={`Download ${file.original_name}`}
        title="Download"
        className="h-10 w-10 sm:h-8 sm:w-8"
        loading={downloading}
        disabled={blocked}
        onClick={() => {
          onDownload(file);
        }}
      />
    </li>
  );
}
