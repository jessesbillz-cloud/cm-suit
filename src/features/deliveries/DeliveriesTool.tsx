// Deliveries (SPEC §13.3; Jesse's MDR board). Board (three weeks + the day's cards), Month (summary + review),
// Link (deliveries.manage) and TV. Post opens the form in the right column. Who sees what comes from has_capability.
import type { ReactNode } from 'react';
import { Monitor, Plus } from 'lucide-react';
import { useDeliveries } from '../../data/deliveries.queries';
import { useCapability, useProject } from '../../data/queries';
import { formatDay, todayInZone } from '../../lib/dates';
import { shiftDay } from '../../lib/deliveries';
import { Button } from '../../ui/Button';
import { Card } from '../../ui/Card';
import { PageHeader } from '../../ui/PageHeader';
import { Segments } from '../../ui/Segments';
import { EmptyState, ErrorState, LoadingState } from '../../ui/States';
import { TOOL_META } from '../../ui/tools';
import { Board, useBoardWindow } from './Board';
import { LinkPanel } from './LinkPanel';
import { MonthView } from './MonthView';
import { TV_DAYS, TV_REFRESH_MS, TvView } from './TvView';
import { enterFullScreen, leaveFullScreen, useToday } from './useTvScreen';
import { NEW_ITEM, useDeliveriesNav, type DeliveryView } from './useDeliveriesNav';

interface DeliveriesToolProps {
  projectId: string;
  itemId: string | null;
  isPhone: boolean;
}

type ScreenView = Exclude<DeliveryView, 'tv'>;
const LABELS: Record<ScreenView, string> = { board: 'Board', month: 'Month', link: 'Link' };
const META = TOOL_META.deliveries;

function Frame({ meta, actions, below, children }: { meta?: string | undefined; actions?: ReactNode; below?: ReactNode; children: ReactNode }) {
  return (
    <div className="flex flex-col">
      <PageHeader title={META.label} icon={META.icon} meta={meta} actions={actions} below={below} />
      {children}
    </div>
  );
}

/** "Today · 2 deliveries", "Wed, Sep 30 · 1 delivery". */
function dayMeta(day: string, today: string, n: number): string {
  const when = day === today ? 'Today' : formatDay(day, 'EEE, MMM d');
  const what = n === 0 ? 'No deliveries' : n === 1 ? '1 delivery' : `${String(n)} deliveries`;
  return `${when} · ${what}`;
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

interface ScreenProps {
  projectId: string;
  projectName: string;
  tz: string;
  today: string;
  day: string;
  current: ScreenView;
  views: readonly ScreenView[];
  canPost: boolean;
  canManage: boolean;
  nav: ReturnType<typeof useDeliveriesNav>;
  /** The delivery open in the right column. */
  itemId: string | null;
}

/** The board's three weeks load here (useBoardWindow): the board shows them and the header counts the day. */
function Screen({ projectId, projectName, tz, today, day, current, views, canPost, canManage, nav, itemId }: ScreenProps) {
  const board = useBoardWindow(day, nav.pickDay);
  const rows = useDeliveries(projectId, board.from, board.to);
  const dayCount = rows.data?.filter((r) => r.delivery_date === day).length;

  const actions = (
    <>
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
      {canPost ? (
        <Button
          variant="primary"
          icon={Plus}
          data-testid="deliveries-post"
          onClick={() => {
            nav.open(NEW_ITEM);
          }}
        >
          Post delivery
        </Button>
      ) : null}
    </>
  );
  const switcher = (
    <Segments
      label="Deliveries"
      options={views.map((v) => ({ value: v, label: LABELS[v] }))}
      value={current}
      onPick={nav.setView}
      testId="deliveries-view"
    />
  );

  return (
    <Frame meta={dayCount === undefined ? undefined : dayMeta(day, today, dayCount)} actions={actions} below={switcher}>
      {current === 'board' ? (
        <Card padded={false}>
          <Board
            tz={tz}
            today={today}
            days={board.days}
            day={day}
            rows={rows.data}
            isPending={rows.isPending}
            error={rows.error}
            onRetry={() => void rows.refetch()}
            onPickDay={nav.pickDay}
            onShift={board.shift}
            onOpen={(id) => {
              nav.open(id);
            }}
            selectedId={itemId}
          />
        </Card>
      ) : null}
      {current === 'month' ? (
        <MonthView
          projectId={projectId}
          projectName={projectName}
          tz={tz}
          day={day}
          canManage={canManage}
          onPickDay={nav.pickDay}
          onOpen={nav.open}
          selectedId={itemId}
        />
      ) : null}
      {current === 'link' ? <LinkPanel projectId={projectId} projectName={projectName} tz={tz} /> : null}
    </Frame>
  );
}

export function DeliveriesTool({ projectId, itemId }: DeliveriesToolProps) {
  const nav = useDeliveriesNav(projectId);
  const project = useProject(projectId);
  const view = useCapability(projectId, 'deliveries.view');
  const post = useCapability(projectId, 'deliveries.post');
  const manage = useCapability(projectId, 'deliveries.manage');

  if (project.isPending || view.isPending || post.isPending || manage.isPending) {
    return (
      <Frame>
        <Card>
          <LoadingState label="Loading deliveries" />
        </Card>
      </Frame>
    );
  }
  if (project.isError) return <Frame><ErrorState error={project.error} onRetry={() => void project.refetch()} /></Frame>;
  const capError = view.error ?? post.error ?? manage.error;
  if (capError) {
    return (
      <Frame>
        <ErrorState error={capError} onRetry={() => void Promise.all([view.refetch(), post.refetch(), manage.refetch()])} />
      </Frame>
    );
  }
  if (!view.data) {
    return (
      <Frame>
        <Card>
          <EmptyState icon={META.icon} title="No deliveries for you on this job." />
        </Card>
      </Frame>
    );
  }

  const tz = project.data.timezone;
  const today = todayInZone(tz);
  const current: DeliveryView = nav.view === 'link' && !manage.data ? 'board' : nav.view;
  const views: ScreenView[] = manage.data ? ['board', 'month', 'link'] : ['board', 'month'];

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
    <Screen
      projectId={projectId}
      projectName={project.data.name}
      tz={tz}
      today={today}
      day={nav.day ?? today}
      current={current}
      views={views}
      canPost={post.data === true}
      canManage={manage.data === true}
      nav={nav}
      itemId={itemId}
    />
  );
}
