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
import { EmptyState, ErrorState, LoadingState } from '../../ui/States';
import { useToast } from '../../ui/Toast';
import { NeedsYou } from './NeedsYou';
import { WhatsNew } from './WhatsNew';
import { useProjectZones } from './zones';

interface BoardProps {
  projectId: string | null;
  selectedId: string | null;
  whatsNewEnabled: boolean;
  onOpen: (line: BoardLine) => void;
}

interface LineProps {
  line: BoardLine;
  showJob: boolean;
  zone: string;
  selected: boolean;
  onOpen: (line: BoardLine) => void;
}

function Line({ line, showJob, zone, selected, onOpen }: LineProps) {
  return (
    <li>
      <button
        type="button"
        data-testid="board-line"
        data-unread={line.unread ? 'true' : undefined}
        className={`flex w-full items-baseline gap-3 px-4 py-2.5 text-left text-sm ${
          selected ? 'bg-accent-soft' : 'hover:bg-page'
        } ${line.unread ? 'font-semibold text-ink' : 'text-ink'}`}
        onClick={() => {
          onOpen(line);
        }}
      >
        <time dateTime={line.created_at} className="w-28 shrink-0 text-xs font-normal tabular-nums text-ink-2">
          {formatInZone(line.created_at, zone, 'MMM d, h:mm a')}
        </time>
        {showJob ? <span className="w-36 shrink-0 truncate text-xs font-normal text-ink-2">{line.project_name}</span> : null}
        <span className="min-w-0 flex-1 break-words">{line.summary}</span>
        <span className="hidden shrink-0 text-xs font-normal text-ink-3 lg:inline">{humanize(line.kind)}</span>
      </button>
    </li>
  );
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

  const filter = (
    <select
      aria-label="Filter by type"
      className="h-8 rounded-md border border-line bg-card px-2 text-sm text-ink"
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
    <div className="mx-auto flex max-w-4xl flex-col gap-4">
      <NeedsYou projectId={projectId} />
      <Card title="Board" actions={filter} padded={false}>
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
            title={lines.length === 0 ? 'No activity yet.' : 'Nothing matches this filter.'}
            hint={lines.length === 0 ? 'Uploads, invites and answers show up here as they happen.' : undefined}
          />
        ) : null}
        {visible.length > 0 ? (
          <ul className="divide-y divide-line">
            {visible.map((l) => (
              <Line
                key={l.id}
                line={l}
                showJob={projectId === null}
                zone={zoneOf(l.project_id)}
                selected={l.id === selectedId}
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
  );
}
