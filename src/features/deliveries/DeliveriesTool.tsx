// Deliveries (SPEC §13.3; Jesse's MDR board). Board (three weeks + the day's cards), Month (summary + review),
// Link (deliveries.manage) and TV. Post opens the form in the right column. Who sees what comes from has_capability.
import { Monitor, Plus } from 'lucide-react';
import { useDeliveries } from '../../data/deliveries.queries';
import { useCapability, useProject } from '../../data/queries';
import { todayInZone } from '../../lib/dates';
import { Button } from '../../ui/Button';
import { Card } from '../../ui/Card';
import { EmptyState, ErrorState, LoadingState } from '../../ui/States';
import { Board, boardWindow } from './Board';
import { LinkPanel } from './LinkPanel';
import { MonthView } from './MonthView';
import { TV_DAYS, TV_REFRESH_MS, TvView } from './TvView';
import { enterFullScreen, leaveFullScreen, useToday } from './useTvScreen';
import { NEW_ITEM, useDeliveriesNav, type DeliveryView } from './useDeliveriesNav';
import { shiftDay } from '../../lib/deliveries';

interface DeliveriesToolProps {
  projectId: string;
  itemId: string | null;
  isPhone: boolean;
}

const LABELS: Record<Exclude<DeliveryView, 'tv'>, string> = { board: 'Board', month: 'Month', link: 'Link' };

interface ViewSwitchProps {
  current: DeliveryView;
  views: readonly Exclude<DeliveryView, 'tv'>[];
  onPick: (v: DeliveryView) => void;
}

function ViewSwitch({ current, views, onPick }: ViewSwitchProps) {
  return (
    <div role="tablist" aria-label="Deliveries" className="inline-flex rounded-md border border-line bg-card p-0.5">
      {views.map((v) => (
        <button
          key={v}
          type="button"
          role="tab"
          aria-selected={v === current}
          data-testid={`deliveries-view-${v}`}
          className={`h-8 rounded px-3 text-sm ${v === current ? 'bg-accent-soft font-medium text-accent' : 'text-ink-2 hover:text-ink'}`}
          onClick={() => {
            onPick(v);
          }}
        >
          {LABELS[v]}
        </button>
      ))}
    </div>
  );
}

interface TvProps {
  projectId: string;
  title: string;
  tz: string;
  onExit: () => void;
}

function InAppTv({ projectId, title, tz, onExit }: TvProps) {
  const today = useToday(tz);
  const rows = useDeliveries(projectId, today, shiftDay(today, TV_DAYS - 1), TV_REFRESH_MS);
  return <TvView title={title} tz={tz} rows={rows.data} error={rows.error} onExit={onExit} />;
}

interface BoardPaneProps {
  projectId: string;
  tz: string;
  today: string;
  day: string;
  onPickDay: (day: string) => void;
  onOpen: (id: string) => void;
}

function BoardPane({ projectId, tz, today, day, onPickDay, onOpen }: BoardPaneProps) {
  const { from, to } = boardWindow(day);
  const rows = useDeliveries(projectId, from, to);
  return (
    <Card>
      <Board
        tz={tz}
        today={today}
        day={day}
        rows={rows.data}
        isPending={rows.isPending}
        error={rows.error}
        onRetry={() => void rows.refetch()}
        onPickDay={onPickDay}
        onOpen={onOpen}
      />
    </Card>
  );
}

export function DeliveriesTool({ projectId }: DeliveriesToolProps) {
  const nav = useDeliveriesNav(projectId);
  const project = useProject(projectId);
  const view = useCapability(projectId, 'deliveries.view');
  const post = useCapability(projectId, 'deliveries.post');
  const manage = useCapability(projectId, 'deliveries.manage');

  if (project.isPending || view.isPending || post.isPending || manage.isPending) return <LoadingState label="Loading deliveries" />;
  if (project.isError) return <ErrorState error={project.error} onRetry={() => void project.refetch()} />;
  const capError = view.error ?? post.error ?? manage.error;
  if (capError) return <ErrorState error={capError} onRetry={() => void Promise.all([view.refetch(), post.refetch(), manage.refetch()])} />;
  if (!view.data) {
    return (
      <Card>
        <EmptyState title="No deliveries for you on this job." />
      </Card>
    );
  }

  const tz = project.data.timezone;
  const today = todayInZone(tz);
  const day = nav.day ?? today;
  const current: DeliveryView = nav.view === 'link' && !manage.data ? 'board' : nav.view;
  const views: Exclude<DeliveryView, 'tv'>[] = manage.data ? ['board', 'month', 'link'] : ['board', 'month'];

  if (current === 'tv') {
    return (
      <InAppTv
        projectId={projectId}
        title={project.data.name}
        tz={tz}
        onExit={() => {
          leaveFullScreen();
          nav.setView('board');
        }}
      />
    );
  }

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <ViewSwitch current={current} views={views} onPick={nav.setView} />
        <span className="flex-1" />
        <Button
          icon={Monitor}
          data-testid="deliveries-tv"
          onClick={() => {
            enterFullScreen();
            nav.setView('tv');
          }}
        >
          TV
        </Button>
        {post.data ? (
          <Button variant="primary" icon={Plus} data-testid="deliveries-post" onClick={() => {
              nav.open(NEW_ITEM);
            }}>
            Post delivery
          </Button>
        ) : null}
      </div>
      {current === 'board' ? <BoardPane projectId={projectId} tz={tz} today={today} day={day} onPickDay={nav.pickDay} onOpen={nav.open} /> : null}
      {current === 'month' ? (
        <MonthView projectId={projectId} projectName={project.data.name} tz={tz} day={day} canManage={manage.data === true} onPickDay={nav.pickDay} />
      ) : null}
      {current === 'link' ? <LinkPanel projectId={projectId} projectName={project.data.name} tz={tz} /> : null}
    </div>
  );
}
