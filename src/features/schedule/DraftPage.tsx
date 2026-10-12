// A draft's review (a page of its own on a desktop; the phone's full screen): its data date, title and counts, then
// every row to check and fix, and Publish. On a desktop a photo or PDF source shows beside the rows (New window from
// there opens it as a file), so each row can be checked against it. Only the people who publish the schedule see drafts.
import type { ReactNode } from 'react';
import { ChevronLeft } from 'lucide-react';
import { useDraftRows, useScheduleVersion } from '../../data/schedule.queries';
import { openItemWindow } from '../../lib/itemWindow';
import { Button } from '../../ui/Button';
import { Card } from '../../ui/Card';
import { FilePreview } from '../../ui/FileViewer';
import { Icon } from '../../ui/Icon';
import { EmptyState, ErrorState, LoadingState } from '../../ui/States';
import { TOOL_META } from '../../ui/tools';
import { DraftHead } from './DraftHead';
import { DraftRows } from './DraftRows';
import { draftItemId } from './model';
import { useSourceItem } from './sourceFile';
import { useScheduleNav } from './useScheduleNav';

interface DraftPageProps {
  projectId: string;
  versionId: string;
  isPhone: boolean;
}

function BackToSchedule({ onBack }: { onBack: () => void }) {
  return (
    <button type="button" className="-ml-1 flex h-8 items-center gap-0.5 self-start text-sm font-medium text-accent" data-testid="schedule-draft-back" onClick={onBack}>
      <Icon icon={ChevronLeft} size={16} />
      Schedule
    </button>
  );
}

export function DraftPage({ projectId, versionId, isPhone }: DraftPageProps) {
  const nav = useScheduleNav(projectId);
  const draft = useScheduleVersion(projectId, versionId);
  const rows = useDraftRows(projectId, versionId);
  const source = useSourceItem(draft.data?.file_id ?? null, draft.data?.file_name ?? null);
  const beside = !isPhone && source !== null && source.kind !== 'other' ? source : null;

  let body: ReactNode;
  const failed = draft.isError ? draft : rows.isError ? rows : null;
  if (failed) body = <ErrorState error={failed.error} onRetry={() => void failed.refetch()} />;
  else if (!draft.data || !rows.data) body = <LoadingState label="Loading the draft" />;
  else if (draft.data.status !== 'draft') {
    body = (
      <EmptyState
        icon={TOOL_META.schedule.icon}
        title="This draft is published."
        action={<Button variant="primary" onClick={() => { nav.close('lookahead'); }}>Look-ahead</Button>}
      />
    );
  } else if (draft.data.discarded) {
    body = <EmptyState icon={TOOL_META.schedule.icon} title="This draft was discarded." />;
  } else {
    body = (
      <>
        <DraftHead
          key={draft.data.id}
          projectId={projectId}
          draft={draft.data}
          source={source}
          beside={beside !== null}
          isPhone={isPhone}
          onPublished={() => { nav.close('lookahead'); }}
          onDiscarded={() => { nav.close('updates'); }}
          onBack={() => { nav.open(draftItemId(versionId)); }}
        />
        {beside ? (
          // The page fills the main area (the source's box says so, data-fill): the rows scroll on the left, the source
          // on the right, the page itself never (Jesse, Oct 12: one scroll per screen).
          <div className="grid min-h-0 flex-1 grid-cols-2 grid-rows-1">
            <div className="min-h-0 overflow-auto">
              <DraftRows projectId={projectId} versionId={versionId} rows={rows.data} />
            </div>
            <div className="flex min-h-0 flex-col border-l border-line p-3">
              <FilePreview
                item={beside}
                onOpenWindow={() => {
                  openItemWindow(projectId, 'files', beside.id);
                }}
              />
            </div>
          </div>
        ) : (
          <DraftRows projectId={projectId} versionId={versionId} rows={rows.data} />
        )}
      </>
    );
  }
  if (isPhone) return <div className="flex flex-col" data-testid="schedule-draft">{body}</div>;
  return (
    <div className="flex flex-col gap-2 has-[[data-fill]]:h-full" data-testid="schedule-draft">
      <BackToSchedule onBack={() => { nav.close('updates'); }} />
      <Card padded={false} className="overflow-clip has-[[data-fill]]:flex has-[[data-fill]]:min-h-0 has-[[data-fill]]:flex-1 has-[[data-fill]]:flex-col">
        {body}
      </Card>
    </div>
  );
}
