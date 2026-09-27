// Plans and specs for a bidder, each a one-click download.
import { Download } from 'lucide-react';
import { useBidDocuments } from '../../data/bidder';
import { Button } from '../../ui/Button';
import { Card } from '../../ui/Card';
import { EmptyState, ErrorState, LoadingState } from '../../ui/States';
import { useDownload } from '../files/useDownload';

export function BidderDocuments({ projectId }: { projectId: string }) {
  const docs = useBidDocuments(projectId);
  const download = useDownload();
  return (
    <Card title="Documents" padded={false}>
      {docs.isPending ? <LoadingState label="Loading documents" /> : null}
      {docs.isError ? <ErrorState error={docs.error} onRetry={() => void docs.refetch()} /> : null}
      {docs.data?.length === 0 ? <EmptyState title="No documents yet" /> : null}
      {docs.data && docs.data.length > 0 ? (
        <ul className="divide-y divide-line">
          {docs.data.map((f) => (
            <li key={f.id} className="flex items-center gap-3 px-4 py-2">
              <span className="min-w-0 flex-1 break-words text-sm text-ink">{f.original_name}</span>
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
          ))}
        </ul>
      ) : null}
    </Card>
  );
}
