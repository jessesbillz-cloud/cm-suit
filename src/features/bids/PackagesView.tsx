// Packages (SPEC §11.2): code, name, first line of scope. "Add package" adds one with the next free code and opens it.
import { Plus } from 'lucide-react';
import { useAddPackage } from '../../data/bids.mutations';
import { useBidPackages } from '../../data/bids.queries';
import { messageOf } from '../../data/errors';
import { Button } from '../../ui/Button';
import { Card } from '../../ui/Card';
import { EmptyState, ErrorState, LoadingState } from '../../ui/States';
import { useToast } from '../../ui/Toast';
import { BidList } from './BidList';
import { firstLine, nextPackageCode } from './model';

interface PackagesViewProps {
  projectId: string;
  orgId: string;
  selectedId: string | null;
  onOpen: (id: string) => void;
}

export function PackagesView({ projectId, orgId, selectedId, onOpen }: PackagesViewProps) {
  const packages = useBidPackages(projectId);
  const add = useAddPackage();
  const toast = useToast();

  function addPackage() {
    const code = nextPackageCode((packages.data ?? []).map((p) => p.code));
    add.mutate(
      { projectId, orgId, code, name: 'New package' },
      {
        onSuccess: (row) => {
          onOpen(row.id);
        },
        onError: (e) => {
          toast.show({ tone: 'error', message: `Not added: ${messageOf(e)}` });
        },
      },
    );
  }

  const action = (
    <Button size="sm" icon={Plus} loading={add.isPending} disabled={!packages.isSuccess} onClick={addPackage}>
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
          rows={packages.data.map((p) => ({ id: p.id, lead: p.code, title: p.name, sub: firstLine(p.scope_text) }))}
        />
      ) : null}
    </Card>
  );
}
