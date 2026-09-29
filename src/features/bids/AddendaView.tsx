// Addenda (SPEC §11.5): number, title, draft/issued, acknowledgments as "acked/bidders". A row opens it on the right.
import { Plus } from 'lucide-react';
import { useCreateAddendum } from '../../data/bids.mutations';
import { useAddenda, useAddendumAcks, useBidInvites } from '../../data/bids.queries';
import { messageOf } from '../../data/errors';
import { Button } from '../../ui/Button';
import { Card } from '../../ui/Card';
import { EmptyState, ErrorState, LoadingState } from '../../ui/States';
import { TOOL_META } from '../../ui/tools';
import { StatusChip } from '../../ui/StatusChip';
import { useToast } from '../../ui/Toast';
import { BidList } from './BidList';

interface AddendaViewProps {
  projectId: string;
  selectedId: string | null;
  onOpen: (id: string) => void;
}

export function AddendaView({ projectId, selectedId, onOpen }: AddendaViewProps) {
  const addenda = useAddenda(projectId);
  const acks = useAddendumAcks(projectId);
  const invites = useBidInvites(projectId);
  const create = useCreateAddendum();
  const toast = useToast();

  const bidders = new Set((invites.data ?? []).map((i) => i.member_id)).size;
  const ackCount = (id: string) => (acks.data ?? []).filter((a) => a.addendum_id === id).length;

  const action = (
    <Button
      size="sm"
      icon={Plus}
      loading={create.isPending}
      onClick={() => {
        create.mutate(projectId, {
          onSuccess: (a) => {
            onOpen(a.id);
          },
          onError: (e) => {
            toast.show({ tone: 'error', message: `Not created: ${messageOf(e)}` });
          },
        });
      }}
    >
      New addendum
    </Button>
  );

  return (
    <Card actions={action} padded={false}>
      {addenda.isPending ? <LoadingState label="Loading addenda" /> : null}
      {addenda.isError ? <ErrorState error={addenda.error} onRetry={() => void addenda.refetch()} /> : null}
      {acks.isError ? <ErrorState error={acks.error} onRetry={() => void acks.refetch()} /> : null}
      {addenda.data?.length === 0 ? <EmptyState title="No addenda yet." icon={TOOL_META.bids.icon} /> : null}
      {addenda.data && addenda.data.length > 0 ? (
        <BidList
          testId="addendum"
          selectedId={selectedId}
          onOpen={onOpen}
          rows={addenda.data.map((a) => ({
            id: a.id,
            lead: String(a.number),
            title: a.title,
            chips:
              a.issued_at === null ? (
                <StatusChip status="pending" label="Draft" />
              ) : (
                <StatusChip status="confirmed" label="Issued" />
              ),
            meta: a.issued_at === null ? '' : `${String(ackCount(a.id))}/${String(bidders)}`,
          }))}
        />
      ) : null}
    </Card>
  );
}
