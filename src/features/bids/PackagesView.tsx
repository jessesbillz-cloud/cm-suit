// Packages (SPEC §11.2): code, name, and the spec sections in one quiet line (else the first line of scope).
// "Add package" opens a new one in the right column, starting from its CSI division.
import { Plus } from 'lucide-react';
import { useBidPackages } from '../../data/bids.queries';
import { sectionsLine } from '../../lib/csi';
import { Button } from '../../ui/Button';
import { Card } from '../../ui/Card';
import { EmptyState, ErrorState, LoadingState } from '../../ui/States';
import { BidList } from './BidList';
import { firstLine } from './model';
import { NEW_PACKAGE_ITEM } from './packageDraft';

interface PackagesViewProps {
  projectId: string;
  selectedId: string | null;
  onOpen: (id: string) => void;
}

export function PackagesView({ projectId, selectedId, onOpen }: PackagesViewProps) {
  const packages = useBidPackages(projectId);

  const action = (
    <Button
      size="sm"
      icon={Plus}
      data-testid="package-add"
      onClick={() => {
        onOpen(NEW_PACKAGE_ITEM);
      }}
    >
      Add package
    </Button>
  );

  return (
    <Card actions={action} padded={false}>
      {packages.isPending ? <LoadingState label="Loading packages" /> : null}
      {packages.isError ? <ErrorState error={packages.error} onRetry={() => void packages.refetch()} /> : null}
      {packages.data?.length === 0 ? <EmptyState title="No packages yet." /> : null}
      {packages.data && packages.data.length > 0 ? (
        <BidList
          testId="package"
          selectedId={selectedId}
          onOpen={onOpen}
          rows={packages.data.map((p) => ({
            id: p.id,
            lead: p.code,
            title: p.name,
            sub: p.spec_sections.length > 0 ? sectionsLine(p.spec_sections) : firstLine(p.scope_text),
          }))}
        />
      ) : null}
    </Card>
  );
}
