// One correction in the right column (or full screen on the phone): the reading pane (SPEC §7.4). Arrow keys move
// through the log in the order it is shown (sort and search come from the URL). History sits behind one link.
import { useState } from 'react';
import { useUser } from '../../data/auth';
import { useCorrectionHistory, useCorrections } from '../../data/corrections.queries';
import { useProject, usePeopleDisplay } from '../../data/queries';
import { formatInZone } from '../../lib/dates';
import { ReadingPane } from '../../ui/ReadingPane';
import { EmptyState, ErrorState, LoadingState } from '../../ui/States';
import { CorrectionBody } from './CorrectionBody';
import { CorrectionHistory } from './CorrectionHistory';
import { cnLabel, neighbors, visibleRows } from './model';
import { useCorrectionCaps } from './useCorrectionCaps';
import { useCorrectionsNav } from './useCorrectionsNav';

interface CorrectionPaneProps {
  projectId: string;
  itemId: string;
  isPhone: boolean;
  onOpenWindow?: (() => void) | undefined;
}

export function CorrectionPane({ projectId, itemId, isPhone, onOpenWindow }: CorrectionPaneProps) {
  const user = useUser();
  const nav = useCorrectionsNav(projectId, itemId);
  const list = useCorrections(projectId);
  const history = useCorrectionHistory(projectId, itemId);
  const project = useProject(projectId);
  const people = usePeopleDisplay(projectId);
  const { caps, error: capsError, retry } = useCorrectionCaps(projectId);
  const [showHistory, setShowHistory] = useState(false);

  if (capsError) return <ErrorState error={capsError} onRetry={retry} />;
  if (list.isError) return <ErrorState error={list.error} onRetry={() => void list.refetch()} />;
  if (history.isError) return <ErrorState error={history.error} onRetry={() => void history.refetch()} />;
  if (project.isError) return <ErrorState error={project.error} onRetry={() => void project.refetch()} />;
  if (people.isError) return <ErrorState error={people.error} onRetry={() => void people.refetch()} />;
  if (!caps || list.isPending || history.isPending || project.isPending || people.isPending) {
    return <LoadingState label="Loading the correction" />;
  }

  const row = list.data.find((r) => r.id === itemId);
  if (!row) return <EmptyState title="This correction is not here." hint="It may have been undone." />;

  const tz = project.data.timezone;
  const names = new Map(people.data.map((p) => [p.user_id, p.full_name]));
  const nameOf = (id: string | null) => (id === null ? 'System' : (names.get(id) ?? 'Someone'));
  const { prev, next } = neighbors(visibleRows(list.data, nav.query, nav.sort), row.id);
  const opened = `Opened ${formatInZone(row.created_at, tz, 'MMM d, yyyy')} by ${nameOf(row.created_by)}`;
  const closed = row.closed_at === null ? '' : ` · Closed ${formatInZone(row.closed_at, tz, 'MMM d, yyyy')}`;

  return (
    <ReadingPane
      number={cnLabel(row.number)}
      title={row.title}
      meta={opened + closed}
      onPrev={prev === null ? undefined : () => {
        nav.open(prev);
      }}
      onNext={next === null ? undefined : () => {
        nav.open(next);
      }}
      onHistory={() => {
        setShowHistory((v) => !v);
      }}
      onOpenWindow={onOpenWindow}
    >
      <CorrectionBody
        key={row.id}
        row={row}
        history={history.data}
        caps={caps}
        userId={user.id}
        nameOf={nameOf}
        timeZone={tz}
        isPhone={isPhone}
      />
      {showHistory ? <CorrectionHistory projectId={projectId} history={history.data} nameOf={nameOf} timeZone={tz} /> : null}
    </ReadingPane>
  );
}
