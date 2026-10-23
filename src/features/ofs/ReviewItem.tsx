// An item of For review beside the list (full screen on the phone): the two boxes on top, then the document itself in
// the one viewer, with the design team's answer or stamp on it (an RFI of the RFI tool as its PDF, answer included).
import { useRfiPdf, rfiPdfViewUrl } from '../../data/rfis.mutations';
import { useOfsItem } from '../../data/ofs';
import type { OfsItem } from '../../data/ofs.types';
import { usePreviewFetch } from '../../data/preview';
import { formatInZone } from '../../lib/dates';
import { FilePreview, type ViewerItem } from '../../ui/FileViewer';
import { ReadingPane } from '../../ui/ReadingPane';
import { EmptyState, ErrorState, LoadingState } from '../../ui/States';
import { useProjectZones } from '../board/zones';
import { fileViewerItem } from '../files/viewerItems';
import { useDownload } from '../files/useDownload';
import { rowTitle, sectionLabel } from './model';
import { OfsPanel } from './OfsPanel';

interface ReviewItemProps {
  projectId: string;
  itemId: string;
  onOpenWindow?: (() => void) | undefined;
}

const KIND_WORD = { rfi: 'RFI', rfi_document: 'RFI', submittal: 'Submittal' } as const;

function ReviewPane({ projectId, item, onOpenWindow }: { projectId: string; item: OfsItem; onOpenWindow?: (() => void) | undefined }) {
  const preview = usePreviewFetch();
  const pdf = useRfiPdf();
  const download = useDownload();
  const zoneOf = useProjectZones();
  const title = rowTitle({ kind: item.kind ?? 'submittal', number: item.number ?? null, title: item.title ?? '' });
  const rfiId = item.rfi_id ?? null;
  const fileId = item.file_id ?? null;
  const shown: ViewerItem | null =
    rfiId !== null
      ? {
          id: `rfi-pdf-${rfiId}`,
          name: title,
          kind: 'pdf',
          url: () => rfiPdfViewUrl(rfiId),
          download: () => pdf.mutateAsync({ id: rfiId, project_id: projectId, version: 0 }),
        }
      : fileId !== null
        ? fileViewerItem({ id: fileId, original_name: item.file_name ?? title, size: item.size ?? 0, mime: item.mime ?? null }, preview)
        : null;
  const kind = item.kind ? KIND_WORD[item.kind] : '';
  const section = item.kind === 'submittal' ? sectionLabel(item.section ?? null) : null;
  return (
    <ReadingPane
      eyebrow={<span>{[kind, section].filter((x) => x).join(' · ')}</span>}
      title={title}
      meta={item.sent_at ? formatInZone(item.sent_at, zoneOf(projectId), 'MMM d, yyyy h:mm a') : undefined}
      onDownload={
        rfiId !== null
          ? () => {
              pdf.mutate({ id: rfiId, project_id: projectId, version: 0 });
            }
          : fileId !== null
            ? () => {
                download.start(fileId, item.size ?? undefined);
              }
            : undefined
      }
      downloading={pdf.isPending || (fileId !== null && download.pendingId === fileId)}
    >
      <div className="flex min-h-0 flex-1 flex-col gap-4">
        {item.id !== null ? <OfsPanel projectId={projectId} target={{ itemId: item.id }} /> : null}
        {shown !== null && shown.kind !== 'other' ? <FilePreview item={shown} onOpenWindow={onOpenWindow} /> : null}
      </div>
    </ReadingPane>
  );
}

export function ReviewItem({ projectId, itemId, onOpenWindow }: ReviewItemProps) {
  const item = useOfsItem({ itemId });
  if (item.isPending) return <LoadingState />;
  if (item.isError) return <ErrorState error={item.error} onRetry={() => void item.refetch()} />;
  if (item.data === null) return <EmptyState title="This item is no longer here, or you no longer have access." />;
  return <ReviewPane projectId={projectId} item={item.data} onOpenWindow={onOpenWindow} />;
}
