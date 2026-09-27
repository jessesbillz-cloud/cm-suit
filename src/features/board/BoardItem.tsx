// One board line opened in the right column (or its own window). Flat reading pane; arrow keys walk the board.
import { useMemo } from 'react';
import { useActivity, useBoardFeed, useFile, useMyProjects } from '../../data/queries';
import { formatInZone } from '../../lib/dates';
import { humanize } from '../../lib/format';
import { ReadingPane } from '../../ui/ReadingPane';
import { EmptyState, ErrorState, LoadingState } from '../../ui/States';
import { useDownload } from '../files/useDownload';
import { useProjectZones } from './zones';

interface BoardItemProps {
  activityId: string;
  /** The board the item was opened from (null = all my jobs): prev/next walk that list. */
  boardProjectId: string | null;
  onNavigate: (activityId: string) => void;
  onOpenWindow?: (() => void) | undefined;
}

export function BoardItem({ activityId, boardProjectId, onNavigate, onOpenWindow }: BoardItemProps) {
  const item = useActivity(activityId);
  const feed = useBoardFeed(boardProjectId);
  const projects = useMyProjects();
  const zoneOf = useProjectZones();
  const download = useDownload();
  const fileId = item.data?.entity_type === 'file' ? item.data.entity_id : null;
  const file = useFile(fileId);

  const neighbors = useMemo(() => {
    const ids = (feed.data?.pages.flat() ?? []).map((l) => l.id);
    const i = ids.indexOf(activityId);
    return { prev: i > 0 ? ids[i - 1] : undefined, next: i >= 0 ? ids[i + 1] : undefined };
  }, [feed.data, activityId]);

  if (item.isPending) return <LoadingState />;
  if (item.isError) return <ErrorState error={item.error} onRetry={() => void item.refetch()} />;
  if (item.data === null) return <EmptyState title="This line is no longer on your board." />;

  const a = item.data;
  const projectName = projects.data?.find((p) => p.project_id === a.project_id)?.name ?? '';
  const when = formatInZone(a.created_at, zoneOf(a.project_id), 'EEE MMM d, yyyy h:mm a');
  const attachments = file.data ? [{ id: file.data.id, name: file.data.original_name, size: file.data.size }] : [];
  const { prev, next } = neighbors;

  return (
    <ReadingPane
      title={a.summary}
      meta={[humanize(a.kind), projectName, when].filter((s) => s).join(' · ')}
      attachments={attachments}
      downloadingId={download.pendingId}
      onDownloadAttachment={(id) => {
        download.start(id, file.data?.size);
      }}
      onOpenWindow={onOpenWindow}
      onDownload={
        file.data
          ? () => {
              if (file.data) download.start(file.data.id, file.data.size);
            }
          : undefined
      }
      downloading={file.data ? download.pendingId === file.data.id : false}
      onPrev={
        prev
          ? () => {
              onNavigate(prev);
            }
          : undefined
      }
      onNext={
        next
          ? () => {
              onNavigate(next);
            }
          : undefined
      }
    />
  );
}
