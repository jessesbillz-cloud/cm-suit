// A spec section's page (Jesse, Oct 12: "click a spec section and say show me all the RFIs and submittals associated
// with this"): its number and title with Open spec (its first page in the book), then its Submittals, RFIs and CCDs,
// each newest first with its count. A group with nothing in it is left out. Only what this person may read: the same
// lists as Files and the RFI tool.
import { BookOpen } from 'lucide-react';
import { Button } from '../../ui/Button';
import { Card } from '../../ui/Card';
import { EmptyState, ErrorState, LoadingState } from '../../ui/States';
import { useOpenSpec } from '../specs/useOpenSpec';
import { HubGroup } from './HubGroup';
import { hubGroups } from './hubItems';
import type { HubData } from './useHubData';

interface SpecHubProps {
  projectId: string;
  /** "092900". */
  sectionKey: string;
  data: HubData;
  timeZone: string | null;
  selectedFileId: string | null;
  onOpenFile: (fileId: string) => void;
  onOpenRfi: (rfiId: string) => void;
}

const spaced = (key: string) => `${key.slice(0, 2)} ${key.slice(2, 4)} ${key.slice(4, 6)}`;

export function SpecHub({ projectId, sectionKey, data, timeZone, selectedFileId, onOpenFile, onOpenRfi }: SpecHubProps) {
  const openSpec = useOpenSpec(projectId);
  const known = data.sections.find((s) => s.key === sectionKey);
  const section = known?.section ?? spaced(sectionKey);
  const title = (
    <span data-testid="spec-hub-title" className="wrap-anywhere">
      <span className="mr-2 tabular-nums">{section}</span>
      {known?.title ?? ''}
    </span>
  );
  const open = known?.inBook ? (
    <Button
      size="sm"
      icon={BookOpen}
      data-testid="spec-hub-spec"
      onClick={() => {
        openSpec({ section });
      }}
    >
      Open spec
    </Button>
  ) : undefined;

  if (data.failed) return <ErrorState error={data.failed.error} onRetry={data.failed.retry} className="m-0" />;
  if (!data.sources) {
    return (
      <Card title={title}>
        <LoadingState label="Loading the section" />
      </Card>
    );
  }
  const g = hubGroups(sectionKey, data.sources);
  const rows = { timeZone, selectedFileId, onOpenFile, onOpenRfi };
  const empty = g.submittals.length + g.rfis.length + g.ccds.length === 0;
  return (
    <Card title={title} actions={open} padded={false}>
      {empty ? <EmptyState icon={BookOpen} title="Nothing filed under this section." /> : null}
      <HubGroup label="Submittals" testId="spec-hub-submittals" items={g.submittals.map((file) => ({ kind: 'file' as const, file }))} {...rows} />
      <HubGroup label="RFIs" testId="spec-hub-rfis" items={g.rfis} {...rows} />
      <HubGroup label="CCDs" testId="spec-hub-ccds" items={g.ccds.map((file) => ({ kind: 'file' as const, file }))} {...rows} />
    </Card>
  );
}
