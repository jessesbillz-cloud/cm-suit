// A file opened in the right column (or its own window): the file itself (a photo, or a PDF's pages, with Full screen),
// its scan state, Rename and Delete (with Undo) when this person may, its earlier versions, Download, Open in new
// window. A signed record (a daily or IR PDF, an RFI PDF, a stamped sheet) never offers Rename or Delete. A sheet in
// Plans or a spec book in Specs is not drawn in the pane (too small to read): Full screen opens it.
import { useState } from 'react';
import { Maximize2, Pencil, Trash2 } from 'lucide-react';
import { useUser } from '../../data/auth';
import { useFileFacts, useRenameFile } from '../../data/files';
import { usePreviewFetch } from '../../data/preview';
import { useFile, useFolders } from '../../data/queries';
import type { FileRow } from '../../data/types';
import { formatInZone } from '../../lib/dates';
import { formatBytes } from '../../lib/format';
import { Button } from '../../ui/Button';
import { FilePreview, useFileViewer } from '../../ui/FileViewer';
import { fileIcon } from '../../ui/fileIcon';
import { Icon } from '../../ui/Icon';
import { ReadingPane } from '../../ui/ReadingPane';
import { EmptyState, ErrorState, LoadingState } from '../../ui/States';
import { StatusChip } from '../../ui/StatusChip';
import { useProjectZones } from '../board/zones';
import { useOpenSpec } from '../specs/useOpenSpec';
import { EarlierVersions } from './EarlierVersions';
import { RenameForm } from './RenameForm';
import { canOpenNow, opensBeforeScan, scanChip } from './scanStatus';
import { useDeleteFile } from './useDeleteFile';
import { useDownload } from './useDownload';
import { fileViewerItem } from './viewerItems';

interface FileItemProps {
  fileId: string;
  onOpenWindow?: (() => void) | undefined;
  /** After a Delete: close the pane (the folder stays). */
  onClose?: (() => void) | undefined;
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

interface PaneProps {
  f: FileRow;
  onOpenWindow?: (() => void) | undefined;
  onClose?: (() => void) | undefined;
}

function FilePane({ f, onOpenWindow, onClose }: PaneProps) {
  const user = useUser();
  const zoneOf = useProjectZones();
  const download = useDownload();
  const facts = useFileFacts(f.id);
  const rename = useRenameFile();
  const viewer = useFileViewer();
  const preview = usePreviewFetch();
  const folders = useFolders(f.project_id);
  const openSpec = useOpenSpec(f.project_id);
  const [renaming, setRenaming] = useState(false);
  const del = useDeleteFile(() => {
    onClose?.();
  });

  const zone = zoneOf(f.project_id);
  const chip = scanChip(f.scan_status, f.upload_complete);
  const notice = scanNotice(f.scan_status, f.created_by === user.id, opensBeforeScan(f.mime, f.original_name));
  const openable = canOpenNow(f, user.id);
  const version = facts.data?.canChange === true ? facts.data.version : null;
  const remove =
    version !== null
      ? () => {
          del.run(f, version);
        }
      : undefined;
  const item = fileViewerItem(f, preview, remove);
  const shows = openable && item.kind !== 'other';
  const folderKind = folders.data?.find((x) => x.id === f.folder_id)?.kind;
  const big = item.kind === 'pdf' && (folderKind === 'plans' || folderKind === 'specs');
  const fullScreen = () => {
    if (folderKind === 'specs') openSpec({ fileId: f.id, page: 1 });
    else viewer.open([item]);
  };

  const actions =
    remove !== undefined ? (
      <>
        <Button
          variant="quiet"
          icon={Pencil}
          data-testid="file-rename"
          onClick={() => {
            setRenaming(true);
          }}
        >
          Rename
        </Button>
        <Button variant="danger" icon={Trash2} data-testid="file-delete" loading={del.pending} onClick={remove}>
          Delete
        </Button>
      </>
    ) : undefined;

  return (
    <ReadingPane
      eyebrow={
        <>
          <Icon icon={fileIcon(f.original_name, f.mime)} size={16} className="text-accent" />
          <StatusChip status={chip.status} label={chip.label} />
        </>
      }
      title={f.original_name}
      meta={`${formatBytes(f.size)} · added ${formatInZone(f.created_at, zone, 'MMM d, yyyy h:mm a')}`}
      onOpenWindow={onOpenWindow}
      actions={actions}
      onDownload={
        f.upload_complete && f.scan_status !== 'infected'
          ? () => {
              download.start(f.id, f.size);
            }
          : undefined
      }
      downloadDisabled={!openable}
      downloading={download.pendingId === f.id}
    >
      <div className="flex flex-col gap-4">
        {renaming && version !== null ? (
          <RenameForm
            name={f.original_name}
            label="File name"
            testId="file-rename-name"
            saving={rename.isPending}
            error={rename.error}
            onCancel={() => {
              rename.reset();
              setRenaming(false);
            }}
            onSave={(name) => {
              rename.mutate(
                { file: f, version, name },
                {
                  onSuccess: () => {
                    setRenaming(false);
                  },
                },
              );
            }}
          />
        ) : null}
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
        {shows && big ? (
          <Button variant="primary" icon={Maximize2} className="self-start" data-testid="file-full-screen" onClick={fullScreen}>
            Full screen
          </Button>
        ) : null}
        {shows && !big ? (
          <FilePreview
            item={item}
            className="h-[min(60vh,32rem)]"
            onFullScreen={() => {
              viewer.open([item]);
            }}
          />
        ) : null}
        {facts.isError ? <ErrorState error={facts.error} onRetry={() => void facts.refetch()} className="m-0" /> : null}
        {facts.data ? <EarlierVersions versions={facts.data.earlier} timeZone={zone} /> : null}
      </div>
    </ReadingPane>
  );
}

export function FileItem({ fileId, onOpenWindow, onClose }: FileItemProps) {
  const file = useFile(fileId);
  if (file.isPending) return <LoadingState />;
  if (file.isError) return <ErrorState error={file.error} onRetry={() => void file.refetch()} />;
  if (file.data === null) return <EmptyState title="This file is no longer here, or you no longer have access." />;
  return <FilePane f={file.data} onOpenWindow={onOpenWindow} onClose={onClose} />;
}
