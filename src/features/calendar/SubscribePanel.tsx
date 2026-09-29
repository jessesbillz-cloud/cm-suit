// Subscribe (MDR's calendar footer): my calendar feed link, the same row Settings has (one implementation), so a phone
// or web calendar can follow every job I'm on.
import { Rss } from 'lucide-react';
import { Icon } from '../../ui/Icon';
import { CalendarFeedRow } from '../settings/CalendarFeedRow';

export function SubscribePanel() {
  return (
    <div className="px-4 pt-4" data-testid="cal-subscribe-panel">
      <p className="flex items-center gap-2 text-[15px] font-semibold text-ink">
        <Icon icon={Rss} size={18} className="text-accent" />
        Subscribe
      </p>
      <CalendarFeedRow />
    </div>
  );
}
