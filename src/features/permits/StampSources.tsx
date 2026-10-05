// The stamp flow's list: the job's PDFs the official may stamp (plan folders first, then their own uploads in "To
// stamp"), a search over names and folders, and Upload (the shared upload queue into "To stamp": each line shows its
// progress, Stop while it runs, Remove once stopped or failed; a stored upload is picked at once, and untaps like any
// other). Each PDF has View (the file viewer, its pages, before it is picked). While stamping, each picked file shows
// how it went.
import { useRef, useState } from 'react';
import { Check, CircleAlert, Eye, FileText, LoaderCircle, Upload } from 'lucide-react';
import type { UseQueryResult } from '@tanstack/react-query';
import { messageOf } from '../../data/errors';
import type { useStampUploads } from '../../data/permitStamp.mutations';
import type { StampSource } from '../../data/permitStamp.types';
import { usePreviewFetch } from '../../data/preview';
import { formatBytes } from '../../lib/format';
import { Button } from '../../ui/Button';
import { useFileViewer } from '../../ui/FileViewer';
import { Icon } from '../../ui/Icon';
import { SearchBox } from '../../ui/SearchBox';
import { EmptyState, ErrorState, LoadingState } from '../../ui/States';
import { useToast } from '../../ui/Toast';
import { UploadLines } from '../files/UploadList';
import { fileViewerItem } from '../files/viewerItems';
import { matchesSource, stateWord, type FileState } from './stamp';

type Uploads = ReturnType<typeof useStampUploads>;

interface StampSourcesProps {
  uploads: Uploads;
  sources: UseQueryResult<StampSource[]>;
  picked: readonly string[];
  states: Readonly<Record<string, FileState>>;
  errors: Readonly<Record<string, string>>;
  /** While stamping: nothing can be picked, dropped or uploaded. */
  locked: boolean;
  onToggle: (id: string) => void;
}

const STATE_ICON = { stamping: LoaderCircle, stamped: Check, failed: CircleAlert } as const;

function StateMark({ state }: { state: FileState }) {
  const color = state === 'failed' ? 'text-danger' : state === 'stamped' ? '' : 'text-ink-2';
  return (
    <span
      className={`flex shrink-0 items-center gap-1 text-[12.5px] font-medium ${color}`}
      style={state === 'stamped' ? { color: 'var(--status-step_done-fg)' } : undefined}
      data-testid="stamp-state"
      data-state={state}
    >
      <Icon icon={STATE_ICON[state]} size={14} className={state === 'stamping' ? 'animate-spin' : ''} />
      {stateWord(state)}
    </span>
  );
}

function UploadPdf({ uploads, disabled }: { uploads: Uploads; disabled: boolean }) {
  const input = useRef<HTMLInputElement>(null);
  const toast = useToast();
  return (
    <>
      <Button icon={Upload} loading={uploads.add.isPending} disabled={disabled} data-testid="stamp-upload" onClick={() => input.current?.click()}>
        Upload
      </Button>
      <input
        ref={input}
        type="file"
        accept="application/pdf,.pdf"
        multiple
        hidden
        data-testid="stamp-upload-input"
        onChange={(e) => {
          const files = [...(e.target.files ?? [])];
          e.target.value = '';
          if (files.length === 0) return;
          uploads.add.mutate(files, { onError: (err) => { toast.show({ tone: 'error', message: `Not uploaded: ${messageOf(err)}` }); } });
        }}
      />
    </>
  );
}

export function StampSources({ uploads, sources, picked, states, errors, locked, onToggle }: StampSourcesProps) {
  const [q, setQ] = useState('');
  const viewer = useFileViewer();
  const preview = usePreviewFetch();
  const rows = (sources.data ?? []).filter((s) => picked.includes(s.id) || matchesSource(s, q));
  // View walks the PDFs as listed (the search applied).
  const items = rows.map((s) => fileViewerItem({ id: s.id, original_name: s.name, size: s.size }, preview));
  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex items-center gap-2">
        <SearchBox label="Search PDFs" placeholder="Search" onChange={setQ} testId="stamp-search" className="flex-1" />
        <UploadPdf uploads={uploads} disabled={locked} />
      </div>
      {uploads.items.some((i) => i.status !== 'done') ? (
        <div className="overflow-hidden rounded-lg border border-line" data-testid="stamp-uploads">
          <UploadLines items={uploads.items.filter((i) => i.status !== 'done')} />
        </div>
      ) : null}
      {sources.isPending ? <LoadingState label="Loading the job's PDFs" /> : null}
      {sources.isError ? <ErrorState className="m-0" error={sources.error} onRetry={() => void sources.refetch()} /> : null}
      {sources.isSuccess && rows.length === 0 ? (
        <EmptyState icon={FileText} title={q ? 'No PDF matches.' : 'No PDFs on this job yet.'} />
      ) : null}
      {rows.length > 0 ? (
        <ul className="flex flex-col divide-y divide-line rounded-lg border border-line bg-card" data-testid="stamp-sources">
          {rows.map((s, i) => {
            const on = picked.includes(s.id);
            const state = states[s.id];
            return (
              <li key={s.id} className="flex items-start">
                <label
                  className={`flex min-w-0 flex-1 items-start gap-2.5 py-2 pl-3 ${locked ? '' : 'cursor-pointer hover:bg-page'}`}
                  data-testid="stamp-source"
                  data-picked={on}
                >
                  <input
                    type="checkbox"
                    className="mt-0.5 h-4 w-4 shrink-0 cursor-[inherit] accent-accent"
                    checked={on}
                    disabled={locked}
                    onChange={() => {
                      onToggle(s.id);
                    }}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block break-words text-[13.5px] font-medium leading-5 text-ink">{s.name}</span>
                    <span className="block text-[12px] leading-4 text-ink-3">
                      {s.folder_name} · {formatBytes(s.size)}
                    </span>
                    {errors[s.id] ? <span className="block text-[12.5px] leading-5 text-danger">{errors[s.id]}</span> : null}
                  </span>
                  {state ? <StateMark state={state} /> : null}
                </label>
                <Button
                  size="sm"
                  variant="quiet"
                  icon={Eye}
                  className="m-1.5"
                  aria-label={`View ${s.name}`}
                  title="View"
                  data-testid="stamp-source-view"
                  onClick={() => {
                    viewer.open(items, i);
                  }}
                />
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}
