// The top of a draft's review: what it is (its source; its file with View and Download), the scheduler's data date
// and the title (saved as they change, version-checked), the counts that matter (rows needing dates, rows to check),
// what the import noticed, and the one action: Publish (Undo for 15 minutes). Discard has Undo too.
import { useState } from 'react';
import { CircleAlert, Download, Eye, Trash2 } from 'lucide-react';
import { messageOf } from '../../data/errors';
import { useDiscardDraft, usePublish, useSaveDraft, useScheduleUndo } from '../../data/schedule.mutations';
import type { Version } from '../../data/schedule.types';
import { Button } from '../../ui/Button';
import { useFileViewer, type ViewerItem } from '../../ui/FileViewer';
import { FIELD_CONTROL, FIELD_LABEL } from '../../ui/Fields';
import { Icon } from '../../ui/Icon';
import { SaveState } from '../../ui/SaveState';
import { StatusChip } from '../../ui/StatusChip';
import { useToast } from '../../ui/Toast';
import { useViewerDownload } from '../../ui/viewer/useViewerDownload';
import { sourceLabel } from './model';

interface DraftHeadProps {
  projectId: string;
  draft: Version;
  /** The source file (sourceFile.ts); `beside` when it already shows next to the rows (no View then). */
  source: ViewerItem | null;
  beside: boolean;
  isPhone: boolean;
  /** After Publish (to the look-ahead), after Discard (to Updates), after an Undo of either (back to the draft). */
  onPublished: () => void;
  onDiscarded: () => void;
  onBack: () => void;
}

function blocker(d: Version): string | null {
  if (d.data_date === null) return 'Add the data date.';
  if (d.activities === 0) return 'No activities.';
  if (d.need_dates > 0) return `${String(d.need_dates)} ${d.need_dates === 1 ? 'activity needs' : 'activities need'} a start date.`;
  return null;
}

export function DraftHead({ projectId, draft, source, beside, isPhone, onPublished, onDiscarded, onBack }: DraftHeadProps) {
  const save = useSaveDraft(projectId, draft.id);
  const publish = usePublish(projectId);
  const undo = useScheduleUndo(projectId);
  const discard = useDiscardDraft(projectId);
  const toast = useToast();
  const viewer = useFileViewer();
  const download = useViewerDownload();
  const [title, setTitle] = useState(draft.title ?? '');
  const stop = blocker(draft);

  function saveHead(next: { title: string; dataDate: string | null }) {
    save.mutate({ version: draft.version, ...next }, {
      onError: (e) => {
        console.warn('schedule draft save failed', e);
      },
    });
  }

  // Awaited, not per-call callbacks: the refresh after a publish or a discard can swap this screen out before they run.
  async function doPublish() {
    const p = await publish.mutateAsync({ id: draft.id, version: draft.version }).catch((e: unknown) => {
      // Shown under the button (publish.error).
      console.warn('schedule publish failed', e);
      return null;
    });
    if (p === null) return;
    onPublished();
    toast.show({
      message: `Update ${String(p.number)} published.`,
      action: {
        label: 'Undo',
        onClick: () => {
          undo.unpublish(draft.id).then(onBack, (e: unknown) => {
            toast.show({ message: messageOf(e), tone: 'error' });
          });
        },
      },
    });
  }

  async function doDiscard() {
    try {
      await discard.mutateAsync(draft.id);
    } catch (e) {
      toast.show({ message: messageOf(e), tone: 'error' });
      return;
    }
    onDiscarded();
    toast.show({
      message: 'Draft discarded.',
      action: {
        label: 'Undo',
        onClick: () => {
          undo.restoreDraft(draft.id).then(onBack, (e: unknown) => {
            toast.show({ message: messageOf(e), tone: 'error' });
          });
        },
      },
    });
  }

  const counts = [`${String(draft.activities)} ${draft.activities === 1 ? 'activity' : 'activities'}`];
  return (
    <header className="flex flex-col gap-4 border-b border-line px-4 py-4 sm:px-5" data-testid="schedule-draft-head">
      <div className="flex flex-wrap items-center gap-2">
        <StatusChip status="pending" label="Draft" />
        <span className="text-[13px] font-medium text-ink-2">{sourceLabel(draft.source_kind)}</span>
        {source ? (
          // The source the rows were read from (rule 12: a person checks them): beside the rows on a desktop, View on a
          // phone (full screen), and one-click Download.
          <span className="flex min-w-0 items-center gap-1" data-testid="schedule-source">
            <span className="min-w-0 break-words text-[13px] font-medium text-ink" data-testid="schedule-source-name">
              {source.name}
            </span>
            {source.kind !== 'other' && !beside ? (
              <Button size="sm" variant="quiet" icon={Eye} aria-label={`View ${source.name}`} data-testid="schedule-source-view" onClick={() => {
                  viewer.open([source]);
                }}
              />
            ) : null}
            <Button
              size="sm"
              variant="quiet"
              icon={Download}
              aria-label={`Download ${source.name}`}
              data-testid="schedule-source-download"
              loading={download.pendingId === source.id}
              onClick={() => {
                download.start(source);
              }}
            />
          </span>
        ) : null}
        <div className="ml-auto">
          <SaveState pending={save.isPending} saved={save.isSuccess} problem={save.isError ? messageOf(save.error) : null} />
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-[12rem_1fr]">
        <label className={FIELD_LABEL}>
          Data date
          <input
            type="date"
            className={`${FIELD_CONTROL} ${draft.data_date === null ? 'border-danger/60' : ''}`}
            value={draft.data_date ?? ''}
            data-testid="schedule-data-date"
            onChange={(e) => { saveHead({ title, dataDate: e.target.value === '' ? null : e.target.value }); }}
          />
        </label>
        <label className={FIELD_LABEL}>
          Title
          <input
            className={FIELD_CONTROL}
            value={title}
            maxLength={200}
            data-testid="schedule-title"
            onChange={(e) => { setTitle(e.target.value); }}
            onBlur={() => {
              if (title.trim() !== (draft.title ?? '')) saveHead({ title, dataDate: draft.data_date });
            }}
          />
        </label>
      </div>
      <p className="text-[13px] text-ink-2" data-testid="schedule-draft-counts">
        {counts.join('')}
        {draft.need_dates > 0 ? <span className="font-medium text-danger"> · {draft.need_dates} need dates</span> : null}
        {draft.unsure > 0 ? <span> · {draft.unsure} to check</span> : null}
      </p>
      {draft.warnings.length > 0 ? (
        <ul className="flex flex-col gap-1 text-[13px] text-ink-2" data-testid="schedule-warnings">
          {draft.warnings.map((w) => (
            <li key={w} className="flex items-start gap-1.5">
              <Icon icon={CircleAlert} size={14} className="mt-[3px] shrink-0 text-ink-3" />
              <span className="min-w-0 break-words">{w}</span>
            </li>
          ))}
        </ul>
      ) : null}
      <div className={`flex flex-wrap items-center gap-2 ${isPhone ? 'flex-col items-stretch' : ''}`}>
        <Button
          variant="primary"
          size={isPhone ? 'lg' : 'md'}
          disabled={stop !== null || save.isPending}
          loading={publish.isPending}
          data-testid="schedule-publish"
          onClick={() => void doPublish()}
        >
          Publish
        </Button>
        <Button variant="quiet" icon={Trash2} loading={discard.isPending} data-testid="schedule-discard" onClick={() => void doDiscard()}>
          Discard
        </Button>
        {stop ? <span className="text-sm text-danger" data-testid="schedule-blocker">{stop}</span> : null}
        {publish.isError ? <span role="alert" className="text-sm text-danger">{messageOf(publish.error)}</span> : null}
      </div>
    </header>
  );
}
