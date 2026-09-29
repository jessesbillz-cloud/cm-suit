// The message board (SPEC §7.3): the default main area. One line per event, newest first, unread bold,
// scrolls back forever, filter by type (and by job via the picker), click opens the line in the right column.
import { useEffect, useMemo, useRef, useState } from 'react';
import { useMarkRead } from '../../data/mutations';
import { useBoardFeed, useReadMark } from '../../data/queries';
import { messageOf } from '../../data/errors';
import type { BoardLine } from '../../data/types';
import { formatInZone } from '../../lib/dates';
import { humanize } from '../../lib/format';
import { Button } from '../../ui/Button';
import { Card } from '../../ui/Card';
import { PageHeader } from '../../ui/PageHeader';
import { EmptyState, ErrorState, LoadingState } from '../../ui/States';
import { useToast } from '../../ui/Toast';
import { TOOL_META } from '../../ui/tools';
import { BoardLineRow } from './BoardLineRow';
import { NeedsYou } from './NeedsYou';
import { TodayReports } from './TodayReports';
import { useNeedsYou } from './useNeedsYou';
import { WhatsNew } from './WhatsNew';
import { useProjectZones } from './zones';

interface BoardProps {
  projectId: string | null;
  selectedId: string | null;
  whatsNewEnabled: boolean;
  onOpen: (line: BoardLine) => void;
}

/** The newest line per job: read marks use the server's timestamps, never the device clock. */
function newestPerJob(lines: readonly BoardLine[]): { projectId: string; seenAt: string }[] {
  const newest = new Map<string, string>();
  for (const l of lines) {
    const cur = newest.get(l.project_id);
    if (cur === undefined || l.created_at > cur) newest.set(l.project_id, l.created_at);
  }
  return [...newest].map(([projectId, seenAt]) => ({ projectId, seenAt }));
}

/** The header's one line: "3 need you · 12 new"; parts still loading are left out. */
function headerMeta(needs: number | null, fresh: number | null): string | undefined {
  const parts = [
    needs !== null && needs > 0 ? `${String(needs)} ${needs === 1 ? 'needs' : 'need'} you` : '',
    fresh !== null && fresh > 0 ? `${String(fresh)} new` : '',
  ].filter((p) => p !== '');
  if (parts.length > 0) return parts.join(' · ');
  return needs === 0 && fresh === 0 ? 'Nothing new' : undefined;
}

export function Board({ projectId, selectedId, whatsNewEnabled, onOpen }: BoardProps) {
  const feed = useBoardFeed(projectId);
  const mark = useReadMark(projectId);
  const markRead = useMarkRead();
  const zoneOf = useProjectZones();
  const toast = useToast();
  const [kind, setKind] = useState('all');
  const [unreadOnly, setUnreadOnly] = useState(false);
  const markedFor = useRef<string | null>(null);
  // The last visit, captured before this visit marks the board read (so the line keeps saying "since ...").
  const [seen, setSeen] = useState<{ key: string; since: string | null } | null>(null);

  const lines = useMemo(() => feed.data?.pages.flat() ?? [], [feed.data]);
  const kinds = useMemo(() => [...new Set(lines.map((l) => l.kind))].sort(), [lines]);
  const unreadCount = useMemo(() => lines.filter((l) => l.unread).length, [lines]);
  const visible = lines.filter((l) => (kind === 'all' || l.kind === kind) && (!unreadOnly || l.unread));

  // Viewing the board marks it read, once per visit, up to the newest line loaded. The bold stays for this visit.
  const firstPage = feed.data?.pages[0];
  useEffect(() => {
    const key = projectId ?? 'all';
    if (!firstPage || markedFor.current === key) return;
    if (projectId !== null && !mark.isSuccess) return;
    markedFor.current = key;
    setSeen({ key, since: projectId !== null ? (mark.data ?? null) : null });
    markRead.mutate(newestPerJob(firstPage), {
      onError: (e) => {
        toast.show({ tone: 'error', message: `Could not mark the board read: ${messageOf(e)}` });
      },
    });
  }, [firstPage, projectId, mark.isSuccess, mark.data, markRead, toast]);

  const sinceAt = projectId !== null && seen?.key === projectId ? seen.since : null;
  const since = projectId !== null && sinceAt ? formatInZone(sinceAt, zoneOf(projectId), 'MMM d, h:mm a') : null;

  const needs = useNeedsYou(projectId);
  const meta = headerMeta(needs.ready ? needs.count : null, feed.isSuccess ? unreadCount : null);

  const filter = (
    <select
      aria-label="Filter by type"
      className="h-8 rounded-md border border-line-strong bg-card pl-2.5 pr-8 text-sm text-ink shadow-control"
      value={kind}
      onChange={(e) => {
        setKind(e.target.value);
      }}
    >
      <option value="all">All types</option>
      {kinds.map((k) => (
        <option key={k} value={k}>
          {humanize(k)}
        </option>
      ))}
    </select>
  );

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader title={TOOL_META.board.label} icon={TOOL_META.board.icon} meta={meta} />
      <div className="flex flex-col gap-4">
        {projectId === null ? <TodayReports /> : null}
        <NeedsYou projectId={projectId} />
        <Card title="Activity" actions={filter} padded={false}>
          {whatsNewEnabled && feed.isSuccess ? (
            <WhatsNew
              count={unreadCount}
              since={since}
              unreadOnly={unreadOnly}
              onToggle={() => {
                setUnreadOnly((v) => !v);
              }}
            />
          ) : null}
          {feed.isPending ? <LoadingState label="Loading the board" /> : null}
          {feed.isError ? <ErrorState error={feed.error} onRetry={() => void feed.refetch()} /> : null}
          {feed.isSuccess && visible.length === 0 ? (
            <EmptyState
              icon={TOOL_META.board.icon}
              title={lines.length === 0 ? 'No activity yet.' : 'Nothing matches this filter.'}
            />
          ) : null}
          {visible.length > 0 ? (
            <ul className="divide-y divide-line">
              {visible.map((l) => (
                <BoardLineRow
                  key={l.id}
                  line={l}
                  showJob={projectId === null}
                  zone={zoneOf(l.project_id)}
                  selected={l.id === selectedId}
                  compact={false}
                  testId="board-line"
                  onOpen={onOpen}
                />
              ))}
            </ul>
          ) : null}
          {feed.hasNextPage ? (
            <div className="flex justify-center border-t border-line p-3">
              <Button variant="quiet" loading={feed.isFetchingNextPage} onClick={() => void feed.fetchNextPage()}>
                Show older
              </Button>
            </div>
          ) : null}
        </Card>
      </div>
    </div>
  );
}
