// Plans and specs for a bidder (and the folders under them): the file's type icon, its name (wraps) and size, View (the
// file viewer: a PDF's pages, a photo; the arrows walk the documents) and a one-click Download.
import { Download, Eye } from 'lucide-react';
import { useUser } from '../../data/auth';
import { useBidDocuments } from '../../data/bidder';
import { usePreviewFetch } from '../../data/preview';
import { formatBytes } from '../../lib/format';
import { Button } from '../../ui/Button';
import { Card } from '../../ui/Card';
import { useFileViewer } from '../../ui/FileViewer';
import { Icon } from '../../ui/Icon';
import { EmptyState, ErrorState, LoadingState } from '../../ui/States';
import { TOOL_META } from '../../ui/tools';
import { fileIcon } from '../../ui/fileIcon';
import { canOpenNow } from '../files/scanStatus';
import { useDownload } from '../files/useDownload';
import { fileViewerItem } from '../files/viewerItems';

export function BidderDocuments({ projectId }: { projectId: string }) {
  const docs = useBidDocuments(projectId);
  const download = useDownload();
  const user = useUser();
  const viewer = useFileViewer();
  const preview = usePreviewFetch();
  const items = (docs.data ?? [])
    .filter((f) => canOpenNow(f, user.id))
    .map((f) => fileViewerItem(f, preview))
    .filter((i) => i.kind !== 'other');
  return (
    <div data-testid="bidder-documents">
      <Card title="Documents" padded={false}>
        {docs.isPending ? <LoadingState label="Loading documents" /> : null}
        {docs.isError ? <ErrorState error={docs.error} onRetry={() => void docs.refetch()} /> : null}
        {docs.data?.length === 0 ? <EmptyState title="No documents yet" icon={TOOL_META.files.icon} /> : null}
        {docs.data && docs.data.length > 0 ? (
          <ul className="divide-y divide-line">
            {docs.data.map((f) => {
              const at = items.findIndex((i) => i.id === f.id);
              return (
                <li key={f.id} className="flex min-h-[52px] items-center gap-3 px-4 py-2.5">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-page text-ink-2">
                    <Icon icon={fileIcon(f.original_name, f.mime)} size={16} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block break-words text-sm font-medium text-ink">{f.original_name}</span>
                    <span className="block text-xs tabular-nums text-ink-2">{formatBytes(f.size)}</span>
                  </span>
                  {at >= 0 ? (
                    <Button size="sm" variant="quiet" icon={Eye} aria-label={`View ${f.original_name}`} data-testid="bidder-doc-view" onClick={() => {
                        viewer.open(items, at);
                      }}
                    >
                      View
                    </Button>
                  ) : null}
                  <Button
                    size="sm"
                    icon={Download}
                    aria-label={`Download ${f.original_name}`}
                    loading={download.pendingId === f.id}
                    onClick={() => {
                      download.start(f.id, f.size);
                    }}
                  >
                    Download
                  </Button>
                </li>
              );
            })}
          </ul>
        ) : null}
      </Card>
    </div>
  );
}
