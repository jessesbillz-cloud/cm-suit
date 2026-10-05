// The right column (full screen on the phone) for the corrections tool: a row, the new-item form, or the progress page.
// A phone has no windows: no "Open in new window" there.
import { Card } from '../../ui/Card';
import { EmptyState, ErrorState, LoadingState } from '../../ui/States';
import { CorrectionPane } from './CorrectionPane';
import { NEW_ITEM, PROGRESS_ITEM } from './model';
import { NewCorrection } from './NewCorrection';
import { ProgressView } from './ProgressView';
import { useCorrectionCaps } from './useCorrectionCaps';
import { useCorrectionsNav } from './useCorrectionsNav';

interface CorrectionItemProps {
  projectId: string;
  itemId: string;
  isPhone: boolean;
  /** Alone in its own window (?window=1). */
  standalone: boolean;
  onOpenWindow?: (() => void) | undefined;
}

const NO_FILES: readonly File[] = [];

function NewItem({ projectId, isPhone }: { projectId: string; isPhone: boolean }) {
  const nav = useCorrectionsNav(projectId, NEW_ITEM);
  const { caps, error, retry } = useCorrectionCaps(projectId);
  if (error) return <ErrorState error={error} onRetry={retry} />;
  if (!caps) return <LoadingState />;
  if (!caps.create) {
    return (
      <Card>
        <EmptyState title="You can't open corrections on this job." />
      </Card>
    );
  }
  return (
    <NewCorrection
      projectId={projectId}
      isPhone={isPhone}
      initialFiles={NO_FILES}
      onCreated={(row) => {
        nav.open(row.id);
      }}
      onCancel={nav.close}
    />
  );
}

export function CorrectionItem({ projectId, itemId, isPhone, standalone, onOpenWindow: openWindow }: CorrectionItemProps) {
  const onOpenWindow = isPhone ? undefined : openWindow;
  if (itemId === NEW_ITEM) return <NewItem projectId={projectId} isPhone={isPhone} />;
  if (itemId === PROGRESS_ITEM) return <ProgressView projectId={projectId} standalone={standalone} onOpenWindow={onOpenWindow} />;
  return <CorrectionPane key={itemId} projectId={projectId} itemId={itemId} isPhone={isPhone} onOpenWindow={onOpenWindow} />;
}
