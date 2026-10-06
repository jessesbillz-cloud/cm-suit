// Required bid forms (SPEC §11.1): the job's checklist, "With the bid" then "After award", each form with its legal
// reference, attached file (View walks the attached files in the viewer; Download is one click) and status. A row opens
// the form on the right; "Add form" adds one this job needs.
// Bids managers only (RLS); the list and the Forms tab count come from the one query.
import { Plus } from 'lucide-react';
import { useBidForms } from '../../data/bidForms';
import { usePreviewFetch } from '../../data/preview';
import type { ProjectRow } from '../../data/types';
import { formatInZone, todayInZone } from '../../lib/dates';
import { Button } from '../../ui/Button';
import { Card } from '../../ui/Card';
import { useFileViewer } from '../../ui/FileViewer';
import { EmptyState, ErrorState, LoadingState } from '../../ui/States';
import { TOOL_META } from '../../ui/tools';
import { useDownload } from '../files/useDownload';
import { fileViewerItem } from '../files/viewerItems';
import { FormRow } from './FormRow';
import { formChip, groupForms, NEW_FORM_ITEM, settledCount } from './forms';

/** "8 of 13 done" over a thin bar (N/A counts as settled). */
function Progress({ done, total }: { done: number; total: number }) {
  return (
    <span className="flex items-center gap-3" data-testid="forms-progress">
      <span className="tabular-nums">
        {done} <span className="font-normal text-ink-2">of {total} done</span>
      </span>
      <span className="block h-1.5 w-28 overflow-hidden rounded-full bg-line" aria-hidden="true">
        <span className="block h-full rounded-full bg-accent" style={{ width: `${String(Math.round((done / total) * 100))}%` }} />
      </span>
    </span>
  );
}

interface FormsViewProps {
  projectId: string;
  selectedId: string | null;
  onOpen: (id: string) => void;
  project: Pick<ProjectRow, 'stage' | 'timezone' | 'bid_due_at'>;
}

export function FormsView({ projectId, selectedId, onOpen, project }: FormsViewProps) {
  const forms = useBidForms(projectId);
  const download = useDownload();
  const today = todayInZone(project.timezone);
  const items = forms.data?.items ?? [];
  const viewer = useFileViewer();
  const preview = usePreviewFetch();
  const files = items.flatMap((i) => (i.file ? [fileViewerItem(i.file, preview)] : [])).filter((f) => f.kind !== 'other');

  const add = (
    <Button size="sm" icon={Plus} data-testid="forms-add" onClick={() => {
        onOpen(NEW_FORM_ITEM);
      }}
    >
      Add form
    </Button>
  );

  return (
    <Card title={items.length > 0 ? <Progress done={settledCount(items)} total={items.length} /> : undefined} actions={add} padded={false}>
      {forms.isPending ? <LoadingState label="Loading forms" /> : null}
      {forms.isError ? <ErrorState error={forms.error} onRetry={() => void forms.refetch()} /> : null}
      {forms.data?.items.length === 0 ? <EmptyState title="No forms on this job." icon={TOOL_META.bids.icon} /> : null}
      {groupForms(items).map((g) => (
        <section key={g.timing} aria-label={g.label} data-testid={`forms-group-${g.timing}`}>
          <header className="flex items-baseline justify-between gap-3 border-b border-line bg-card-head px-4 pb-2 pt-3 text-xs">
            <h3 className="text-[12px] font-bold uppercase tracking-wide text-ink">{g.label}</h3>
            {g.timing === 'with_bid' && project.bid_due_at !== null ? (
              <span className="tabular-nums text-ink-2">Due {formatInZone(project.bid_due_at, project.timezone, 'MMM d, h:mm a')}</span>
            ) : null}
          </header>
          <ul className="divide-y divide-line">
            {g.items.map((item) => (
              <FormRow
                key={item.id}
                item={item}
                chip={formChip(item, project.stage, today)}
                selected={item.id === selectedId}
                downloading={item.file !== null && download.pendingId === item.file.id}
                onOpen={onOpen}
                onView={
                  item.file && files.some((f) => f.id === item.file?.id)
                    ? () => {
                        viewer.open(files, files.findIndex((f) => f.id === item.file?.id));
                      }
                    : undefined
                }
                onDownload={download.start}
              />
            ))}
          </ul>
        </section>
      ))}
    </Card>
  );
}
