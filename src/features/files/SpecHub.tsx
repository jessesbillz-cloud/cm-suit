// What is filed under a spec section (Jesse, Oct 12: "click a spec section and say show me all the RFIs and submittals
// associated with this"): its Submittals, RFIs and CCDs, each newest first with its count, at the end of the section's
// text in the spec reader (0118), or alone for a section the spec book lacks. A group with nothing in it is left out.
// Only what this person may read: the same lists as Files and the RFI tool.
import type { ReactNode } from 'react';
import { Layers } from 'lucide-react';
import { Card } from '../../ui/Card';
import { EmptyState, ErrorState, LoadingState } from '../../ui/States';
import { HubGroup } from './HubGroup';
import { hubGroups } from './hubItems';
import type { HubData } from './useHubData';

interface SpecHubProps {
  /** "092900". */
  sectionKey: string;
  title: ReactNode;
  data: HubData;
  timeZone: string | null;
  selectedFileId: string | null;
  onOpenFile: (fileId: string) => void;
  onOpenRfi: (rfiId: string) => void;
}

export function SpecHub({ sectionKey, title, data, timeZone, selectedFileId, onOpenFile, onOpenRfi }: SpecHubProps) {
  if (data.failed) return <ErrorState error={data.failed.error} onRetry={data.failed.retry} className="m-0" />;
  if (!data.sources) {
    return (
      <Card title={title}>
        <LoadingState label="Loading what is filed under it" />
      </Card>
    );
  }
  const g = hubGroups(sectionKey, data.sources);
  const rows = { timeZone, selectedFileId, onOpenFile, onOpenRfi };
  const empty = g.submittals.length + g.rfis.length + g.ccds.length === 0;
  return (
    <Card title={title} padded={false}>
      {empty ? <EmptyState icon={Layers} title="Nothing filed under this section." /> : null}
      <HubGroup label="Submittals" testId="spec-hub-submittals" items={g.submittals.map((file) => ({ kind: 'file' as const, file }))} {...rows} />
      <HubGroup label="RFIs" testId="spec-hub-rfis" items={g.rfis} {...rows} />
      <HubGroup label="CCDs" testId="spec-hub-ccds" items={g.ccds.map((file) => ({ kind: 'file' as const, file }))} {...rows} />
    </Card>
  );
}
