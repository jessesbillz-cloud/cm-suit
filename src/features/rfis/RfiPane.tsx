// One RFI in the right column (full screen on the phone, or alone in its own window): my own draft opens as the form to
// finish and sign; any other RFI is the reading pane (Jesse, Sep 30): the substance at once, with no extra taps. The
// header (number, the whole title, three actions), the route strip, the question with its photos and the answer right
// under it; then impact and, small, the moves I may make. History only in the full view (its own window, or the
// phone's full screen). Arrow keys walk the log as it is shown.
import { useEffect, useRef, useState } from 'react';
import { useUser } from '../../data/auth';
import { messageOf } from '../../data/errors';
import { useProject } from '../../data/queries';
import { useRfiPdf, useRfiPdfView } from '../../data/rfis.mutations';
import { useRfiDetail, useRfiList, useRfiProgress } from '../../data/rfis.queries';
import type { RfiDetail, RfiEvent } from '../../data/rfis.types';
import { blankTab } from '../../lib/openTab';
import { PaneSection } from '../../ui/ReadingPane';
import { ErrorState, LoadingState } from '../../ui/States';
import { useToast } from '../../ui/Toast';
import { neighbors, visibleRows } from './model';
import { stripsByRfi } from './progress';
import { RfiActions } from './RfiActions';
import { RfiBody } from './RfiBody';
import { RfiCompose } from './RfiCompose';
import { RfiEdit } from './RfiEdit';
import { RfiHead } from './RfiHead';
import { RfiHistory } from './RfiHistory';
import { RfiImpact } from './RfiImpact';
import { RfiWhere } from './RfiWhere';
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

function isTyping(target: EventTarget): boolean {
  return target instanceof HTMLElement && (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName));
}

export function RfiPane({ projectId, itemId, isPhone, onOpenWindow }: RfiPaneProps) {
  const user = useUser();
  const nav = useRfisNav(projectId, itemId);
  const detail = useRfiDetail(projectId, itemId);
  const list = useRfiList(projectId);
  const progress = useRfiProgress(projectId);
  const project = useProject(projectId);
  const pdf = useRfiPdf();
  const view = useRfiPdfView();
  const toast = useToast();
  const root = useRef<HTMLElement>(null);
  // While editing, the pane keeps the title it opened with: a saved title must not pull focus out of the form.
  const [editingTitle, setEditingTitle] = useState<string | null>(null);

  // Focus the pane when the RFI changes, so the arrow keys work straight away.
  useEffect(() => {
    root.current?.focus({ preventScroll: true });
  }, [itemId, detail.isSuccess]);

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

  const shown = visibleRows(list.data ?? [], { filter: nav.filter, query: nav.query, userId: user.id }, now);
  const { prev, next } = neighbors(shown, d.rfi.id);
  const steps = progress.data ? (stripsByRfi(progress.data).get(d.rfi.id) ?? []) : undefined;
  const full = nav.standalone || isPhone;
  const failed = (e: unknown) => {
    toast.show({ tone: 'error', message: messageOf(e) });
  };

  return (
    <article
      ref={root}
      tabIndex={-1}
      className="flex h-full flex-col outline-none"
      onKeyDown={(e) => {
        if (isTyping(e.target)) return;
        const to = e.key === 'ArrowDown' || e.key === 'ArrowRight' ? next : e.key === 'ArrowUp' || e.key === 'ArrowLeft' ? prev : null;
        if (to === null) return;
        e.preventDefault();
        nav.open(to);
      }}
    >
      <RfiHead
        detail={d}
        title={editingTitle ?? d.rfi.title}
        timeZone={tz}
        onOpenWindow={onOpenWindow}
        onDownload={() => {
          pdf.mutate(d.rfi, { onError: failed });
        }}
        downloading={pdf.isPending}
        onView={() => {
          const tab = blankTab();
          if (tab === null) {
            toast.show({ tone: 'error', message: 'Allow pop-ups to see it full screen.' });
            return;
          }
          view.mutate({ ref: d.rfi, tab }, { onError: failed });
        }}
        viewing={view.isPending}
        isPhone={isPhone}
      />
      <div className="flex flex-1 flex-col gap-3 overflow-auto px-5 py-4 text-sm leading-6 text-ink" data-testid="rfi-pane">
        <RfiWhere detail={d} steps={steps} timeZone={tz} now={now} layout={nav.standalone && !isPhone ? 'line' : 'stack'} />
        {progress.isError ? <ErrorState error={progress.error} onRetry={() => void progress.refetch()} /> : null}
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
        {full ? <RfiHistory events={d.events} timeZone={tz} /> : null}
      </div>
    </article>
  );
}
