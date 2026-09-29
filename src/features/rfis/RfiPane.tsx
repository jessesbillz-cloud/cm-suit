// One RFI in the right column (full screen on the phone): my own draft opens as the form to finish and sign; any other
// RFI is the reading pane (SPEC §7.4): where it is (the tracker), the question and answer in one flat view, impact,
// then only the moves I may make. PDF any time; history behind one link; arrow keys walk the log as it is shown.
import { useState } from 'react';
import { FileQuestion } from 'lucide-react';
import { useUser } from '../../data/auth';
import { messageOf } from '../../data/errors';
import { useProject } from '../../data/queries';
import { useRfiPdf } from '../../data/rfis.mutations';
import { useRfiDetail, useRfiList } from '../../data/rfis.queries';
import type { RfiDetail, RfiEvent } from '../../data/rfis.types';
import { formatInZone } from '../../lib/dates';
import { Icon } from '../../ui/Icon';
import { PaneSection, ReadingPane } from '../../ui/ReadingPane';
import { ErrorState, LoadingState } from '../../ui/States';
import { StatusChip } from '../../ui/StatusChip';
import { useToast } from '../../ui/Toast';
import { neighbors, rfiLabel, statusChip, visibleRows } from './model';
import { RfiActions } from './RfiActions';
import { RfiBody } from './RfiBody';
import { RfiCompose } from './RfiCompose';
import { RfiEdit } from './RfiEdit';
import { RfiHistory } from './RfiHistory';
import { RfiImpact } from './RfiImpact';
import { RfiTracker } from './RfiTracker';
import { useRfisNav } from './useRfisNav';

interface RfiPaneProps {
  projectId: string;
  itemId: string;
  isPhone: boolean;
  onOpenWindow?: (() => void) | undefined;
}

/** The latest "sent back" when that is what brought the draft back to me. */
function returnedEvent(d: RfiDetail): RfiEvent | null {
  const last = [...d.events].reverse().find((e) => e.kind !== 'opened' && e.kind !== 'edited');
  return last?.kind === 'returned' ? last : null;
}

function meta(d: RfiDetail, tz: string): string {
  const asked = d.rfi.sent_at === null ? '' : ` · Asked ${formatInZone(d.rfi.sent_at, tz, 'MMM d, yyyy')}`;
  return `${d.originator_name}${asked}`;
}

export function RfiPane({ projectId, itemId, isPhone, onOpenWindow }: RfiPaneProps) {
  const user = useUser();
  const nav = useRfisNav(projectId, itemId);
  const detail = useRfiDetail(projectId, itemId);
  const list = useRfiList(projectId);
  const project = useProject(projectId);
  const pdf = useRfiPdf();
  const toast = useToast();
  const [showHistory, setShowHistory] = useState(false);
  // While editing, the pane keeps the title it opened with: a saved title must not pull focus out of the form.
  const [editingTitle, setEditingTitle] = useState<string | null>(null);

  if (detail.isError) return <ErrorState error={detail.error} onRetry={() => void detail.refetch()} />;
  if (project.isError) return <ErrorState error={project.error} onRetry={() => void project.refetch()} />;
  if (detail.isPending || project.isPending) return <LoadingState label="Loading the RFI" />;

  const d = detail.data;
  const tz = project.data.timezone;
  const now = new Date();

  if (d.rfi.status === 'draft' && d.can.send) {
    return (
      <RfiCompose
        key={d.rfi.id}
        projectId={projectId}
        row={d.rfi}
        photos={d.photos}
        returned={returnedEvent(d)}
        timeZone={tz}
        isPhone={isPhone}
        onSent={nav.replace}
        onDiscarded={nav.close}
      />
    );
  }

  const shown = visibleRows(list.data ?? [], { filter: nav.filter, query: nav.query, sort: nav.sort, userId: user.id }, now);
  const { prev, next } = neighbors(shown, d.rfi.id);
  const chip = statusChip(d.rfi.status);

  return (
    <ReadingPane
      eyebrow={
        <>
          <Icon icon={FileQuestion} size={16} className="text-accent" />
          <span data-testid="rfi-label">{rfiLabel(d.rfi.number)}</span>
          <span className="ml-1" data-testid="rfi-status">
            <StatusChip status={chip.status} label={chip.label} />
          </span>
        </>
      }
      title={editingTitle ?? d.rfi.title}
      meta={meta(d, tz)}
      onPrev={prev === null ? undefined : () => { nav.open(prev); }}
      onNext={next === null ? undefined : () => { nav.open(next); }}
      onHistory={() => {
        setShowHistory((v) => !v);
      }}
      onOpenWindow={onOpenWindow}
      onDownload={() => {
        pdf.mutate(d.rfi, {
          onError: (e) => {
            toast.show({ tone: 'error', message: messageOf(e) });
          },
        });
      }}
      downloading={pdf.isPending}
      downloadLabel="PDF"
    >
      <div className="flex flex-col gap-3" data-testid="rfi-pane">
        <PaneSection>
          <RfiTracker detail={d} timeZone={tz} now={now} />
        </PaneSection>
        {editingTitle !== null ? (
          <RfiEdit row={d.rfi} photos={d.photos} isPhone={isPhone} onDone={() => { setEditingTitle(null); }} />
        ) : (
          <RfiBody detail={d} timeZone={tz} />
        )}
        {d.rfi.status === 'void' && d.rfi.void_note ? (
          <PaneSection title="Void" tone="tint">
            <p className="whitespace-pre-wrap break-words text-sm text-ink">{d.rfi.void_note}</p>
          </PaneSection>
        ) : null}
        <RfiImpact detail={d} timeZone={tz} now={now} />
        {editingTitle === null ? <RfiActions detail={d} onEdit={() => { setEditingTitle(d.rfi.title); }} /> : null}
      </div>
      {showHistory ? <RfiHistory events={d.events} timeZone={tz} /> : null}
    </ReadingPane>
  );
}
