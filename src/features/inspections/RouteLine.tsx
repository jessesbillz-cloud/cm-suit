// The job's OFS route on one line (0116), "Contractor checks > Inspector sends > Fire marshal", with the stop a
// request is at in bold, so everyone sees where it goes next. The owner sets the route in Settings > Job.
import { Fragment } from 'react';
import { ChevronRight } from 'lucide-react';
import type { OfsRouteInfo } from '../../data/inspections.ofs';
import { Icon } from '../../ui/Icon';
import { routeStops } from './ofsFlow';

interface RouteLineProps {
  route: OfsRouteInfo;
  /** The stop to mark (routeAt), or null for none. */
  at?: string | null | undefined;
  testId?: string | undefined;
}

export function RouteLine({ route, at = null, testId = 'ofs-route-line' }: RouteLineProps) {
  const stops = routeStops(route);
  return (
    <p className="flex flex-wrap items-center gap-x-1 gap-y-0.5 text-sm text-ink-2" data-testid={testId} data-at={at ?? ''}>
      {stops.map((s, i) => (
        <Fragment key={s.key}>
          {i > 0 ? <Icon icon={ChevronRight} size={14} className="shrink-0 text-ink-2" /> : null}
          <span className={s.key === at ? 'font-semibold text-ink' : ''} data-stop={s.key}>
            {s.label}
          </span>
        </Fragment>
      ))}
    </p>
  );
}
