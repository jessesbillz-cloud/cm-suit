// My calendar feed (SPEC §6.4 #7): one secret link, for every job I'm on, that a phone or web calendar subscribes to.
// The link can be shown only when it is made (only its hash is kept), so "Copy link" makes the first one and
// "New link" replaces it: the old link stops working.
import { useState } from 'react';
import { Copy, RefreshCw } from 'lucide-react';
import { useRotateCalendarFeed } from '../../data/calendar.mutations';
import { useCalendarFeed } from '../../data/calendar.queries';
import { messageOf } from '../../data/errors';
import { detectZone, formatInZone } from '../../lib/dates';
import { Button } from '../../ui/Button';
import { ErrorState } from '../../ui/States';
import { useToast } from '../../ui/Toast';
import { SettingRow } from './SettingRow';

export function CalendarFeedRow() {
  const feed = useCalendarFeed();
  const rotate = useRotateCalendarFeed();
  const toast = useToast();
  // The link lives only on this screen, only right after it is made.
  const [url, setUrl] = useState<string | null>(null);

  function copy(link: string, message = 'Link copied.') {
    navigator.clipboard.writeText(link).then(
      () => {
        toast.show({ message });
      },
      (e: unknown) => {
        console.warn('clipboard write failed', e);
        toast.show({ tone: 'error', message: 'Could not copy. Copy the link below.' });
      },
    );
  }

  function make() {
    const replacing = feed.data !== null && feed.data !== undefined;
    rotate.mutate(undefined, {
      onSuccess: (link) => {
        setUrl(link);
        copy(link, replacing ? 'New link copied. The old one no longer works.' : 'Link copied.');
      },
      onError: (e) => {
        toast.show({ tone: 'error', message: `No link made: ${messageOf(e)}` });
      },
    });
  }

  if (feed.isError) return <ErrorState error={feed.error} onRetry={() => void feed.refetch()} />;
  const made = feed.data ?? null;
  const has = made !== null;

  return (
    <div className="mt-3 border-t border-line">
      <SettingRow label="Calendar feed" testId="calendar-feed">
        <div className="flex flex-wrap items-center gap-3">
          {feed.isPending ? (
            <span role="status" className="text-xs text-ink-2">
              Loading...
            </span>
          ) : null}
          {made !== null && url === null ? (
            <span className="text-sm text-ink-2">Made {formatInZone(made.rotated_at, detectZone(), 'MMM d, yyyy')}</span>
          ) : null}
          <div className="flex gap-2">
            {feed.isSuccess && (!has || url !== null) ? (
              <Button
                size="sm"
                icon={Copy}
                loading={rotate.isPending && !has}
                onClick={() => {
                  if (url !== null) copy(url);
                  else make();
                }}
              >
                Copy link
              </Button>
            ) : null}
            {has ? (
              <Button size="sm" icon={RefreshCw} loading={rotate.isPending} onClick={make}>
                New link
              </Button>
            ) : null}
          </div>
        </div>
        {url !== null ? (
          <input
            readOnly
            aria-label="Calendar feed link"
            value={url}
            className="mt-2 h-9 w-full max-w-md rounded-md border border-line bg-page px-2.5 text-xs text-ink"
            onFocus={(e) => {
              e.target.select();
            }}
          />
        ) : null}
      </SettingRow>
    </div>
  );
}
