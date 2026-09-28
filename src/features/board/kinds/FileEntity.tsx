// A board line about a file: its name, folder, size and scan state, with Download (one click) and Open in Files.
import { useFile, useFolders } from '../../../data/queries';
import { formatInZone } from '../../../lib/dates';
import { formatBytes } from '../../../lib/format';
import { ErrorState, LoadingState } from '../../../ui/States';
import { StatusChip } from '../../../ui/StatusChip';
import { scanChip } from '../../files/scanStatus';
import { useDownload } from '../../files/useDownload';
import { EntityPane, Facts, type KindProps } from '../EntityPane';

export function FileEntity({ frame, id }: KindProps) {
  const file = useFile(id);
  const folders = useFolders(frame.projectId);
  const download = useDownload();

  if (file.isPending) return <LoadingState label="Loading the file" />;
  if (file.isError) return <ErrorState error={file.error} onRetry={() => void file.refetch()} />;
  if (file.data === null) return <EntityPane frame={{ ...frame, open: null }} label="File" title="This file isn't here." />;

  const f = file.data;
  const folder = folders.data?.find((x) => x.id === f.folder_id)?.name ?? null;
  const chip = scanChip(f.scan_status, f.upload_complete);
  const canDownload = f.upload_complete && f.scan_status !== 'infected';
  return (
    <EntityPane
      frame={frame}
      label="File"
      title={f.original_name}
      openExtra={{ folder: f.folder_id }}
      download={
        canDownload
          ? {
              label: 'Download',
              loading: download.pendingId === f.id,
              onClick: () => {
                download.start(f.id, f.size);
              },
            }
          : undefined
      }
    >
      <Facts
        rows={[
          ['Folder', folder],
          ['Size', formatBytes(f.size)],
          ['Added', formatInZone(f.created_at, frame.zone, 'MMM d, yyyy h:mm a')],
          f.scan_status === 'clean' && f.upload_complete ? null : ['Scan', <StatusChip key="scan" status={chip.status} label={chip.label} />],
        ]}
      />
    </EntityPane>
  );
}
