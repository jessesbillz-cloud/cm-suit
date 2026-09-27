// One file: name (wraps), size, scan status, and ONE download button (data-testid="file-row-download").
import { Download, FileText } from 'lucide-react';
import type { FileRow as File } from '../../data/types';
import { formatBytes } from '../../lib/format';
import { Button } from '../../ui/Button';
import { Icon } from '../../ui/Icon';
import { StatusChip } from '../../ui/StatusChip';
import { scanChip } from './scanStatus';

interface FileRowProps {
  file: File;
  selected: boolean;
  downloading: boolean;
  onOpen: (fileId: string) => void;
  onDownload: (file: File) => void;
}

export function FileRow({ file, selected, downloading, onOpen, onDownload }: FileRowProps) {
  const chip = scanChip(file.scan_status, file.upload_complete);
  const blocked = file.scan_status === 'infected' || !file.upload_complete;
  return (
    <li
      data-testid="file-row"
      className={`flex items-center gap-3 px-4 py-2.5 ${selected ? 'bg-accent-soft' : 'hover:bg-page'}`}
    >
      <Icon icon={FileText} size={18} className="shrink-0 text-ink-3" />
      <button
        type="button"
        className="min-w-0 flex-1 break-words text-left text-sm text-ink hover:underline"
        onClick={() => {
          onOpen(file.id);
        }}
      >
        {file.original_name}
      </button>
      <span className="hidden w-20 shrink-0 text-right text-xs tabular-nums text-ink-2 sm:block">{formatBytes(file.size)}</span>
      {file.scan_status === 'clean' && file.upload_complete ? null : <StatusChip status={chip.status} label={chip.label} />}
      <Button
        size="sm"
        variant="secondary"
        icon={Download}
        data-testid="file-row-download"
        aria-label={`Download ${file.original_name}`}
        loading={downloading}
        disabled={blocked}
        onClick={() => {
          onDownload(file);
        }}
      >
        Download
      </Button>
    </li>
  );
}
