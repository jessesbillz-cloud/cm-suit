// A delivery in the right column (or full screen on a phone): its receipt, photos, Edit / Delete for its poster and
// deliveries.manage, and its history behind one link. Item 'new' is the post form.
import { useState } from 'react';
import { History, Pencil, Printer, Trash2 } from 'lucide-react';
import { useIsPhone } from '../../app/frame/useIsPhone';
import { useUser } from '../../data/auth';
import { useDelivery } from '../../data/deliveries.queries';
import { useRestoreDelivery } from '../../data/deliveries.mutations';
import type { DeliveryRow } from '../../data/deliveries.types';
import { messageOf } from '../../data/errors';
import { useCapability, useProject } from '../../data/queries';
import { todayInZone } from '../../lib/dates';
import { Button } from '../../ui/Button';
import { Card } from '../../ui/Card';
import { EmptyState, ErrorState, LoadingState } from '../../ui/States';
import { useToast } from '../../ui/Toast';
import { DeleteBox } from './DeleteBox';
import { DeliveryPhotos } from './DeliveryPhotos';
import { EditDelivery } from './EditDelivery';
import { HistoryList } from './HistoryList';
import { PostDelivery } from './PostDelivery';
import { PrintSheet } from './PrintSheet';
import { PrintedReceipt, ReceiptBody } from './Receipt';
import { NEW_ITEM, useDeliveriesNav } from './useDeliveriesNav';

interface DeliveryItemProps {
  projectId: string;
  itemId: string;
}

interface PaneProps {
  projectId: string;
  projectName: string;
  row: DeliveryRow;
  tz: string;
  canChange: boolean;
}

type Mode = 'view' | 'edit' | 'delete' | 'history' | 'print';

function DeliveryPane({ projectId, projectName, row, tz, canChange }: PaneProps) {
  const [mode, setMode] = useState<Mode>('view');
  const restore = useRestoreDelivery(projectId);
  const toast = useToast();
  const isPhone = useIsPhone();
  const deleted = row.deleted_at !== null;
  const receipt = { ...row, posted_at: row.created_at };
  const toView = () => {
    setMode('view');
  };
  const doRestore = () => {
    restore.mutate(row.id, {
      onError: (e) => {
        toast.show({ tone: 'error', message: `Not restored: ${messageOf(e)}` });
      },
    });
  };
  const onDeleted = () => {
    setMode('view');
    toast.show({ message: `Deleted #${String(row.number)}.`, action: { label: 'Undo', onClick: doRestore } });
  };

  if (mode === 'edit') {
    return (
      <Card title={`Edit #${String(row.number)}`}>
        <EditDelivery projectId={projectId} row={row} tz={tz} onDone={toView} />
      </Card>
    );
  }

  return (
    <Card
      title={`Delivery #${String(row.number)}`}
      actions={
        <Button size="sm" variant="quiet" icon={Printer} onClick={() => {
            setMode('print');
          }}>
          Print
        </Button>
      }
    >
      <div className="flex flex-col gap-4">
        <ReceiptBody delivery={receipt} tz={tz} />
        {deleted ? (
          <div className="flex items-center gap-3">
            <p className="min-w-0 flex-1 text-sm text-danger">Deleted by {row.deleted_name}</p>
            {canChange ? (
              <Button size="sm" loading={restore.isPending} onClick={doRestore}>
                Undo
              </Button>
            ) : null}
          </div>
        ) : (
          <DeliveryPhotos projectId={projectId} deliveryId={row.id} fileIds={row.file_ids} canAdd={canChange} isPhone={isPhone} />
        )}
        {mode === 'delete' ? <DeleteBox projectId={projectId} row={row} onDeleted={onDeleted} onCancel={toView} /> : null}
        <div className="flex flex-wrap gap-2">
          {canChange && !deleted && mode !== 'delete' ? (
            <>
              <Button size="sm" icon={Pencil} onClick={() => {
                  setMode('edit');
                }}>
                Edit
              </Button>
              <Button size="sm" variant="danger" icon={Trash2} onClick={() => {
                  setMode('delete');
                }}>
                Delete
              </Button>
            </>
          ) : null}
          {mode !== 'history' ? (
            <Button size="sm" variant="quiet" icon={History} onClick={() => {
                setMode('history');
              }}>
              History
            </Button>
          ) : null}
        </div>
        {mode === 'history' ? <HistoryList projectId={projectId} deliveryId={row.id} tz={tz} /> : null}
      </div>
      {mode === 'print' ? (
        <PrintSheet onClose={toView}>
          <PrintedReceipt projectName={projectName} delivery={receipt} tz={tz} />
        </PrintSheet>
      ) : null}
    </Card>
  );
}

function ExistingDelivery({ projectId, itemId }: DeliveryItemProps) {
  const q = useDelivery(projectId, itemId);
  const project = useProject(projectId);
  const post = useCapability(projectId, 'deliveries.post');
  const manage = useCapability(projectId, 'deliveries.manage');
  const me = useUser();

  if (q.isPending || project.isPending) return <LoadingState label="Loading the delivery" />;
  if (q.isError) return <ErrorState error={q.error} onRetry={() => void q.refetch()} />;
  if (project.isError) return <ErrorState error={project.error} onRetry={() => void project.refetch()} />;
  if (q.data === null) return <EmptyState title="This delivery is no longer here." />;
  const row = q.data;
  const canChange = manage.data === true || (row.created_by === me.id && post.data === true);
  return <DeliveryPane projectId={projectId} projectName={project.data.name} row={row} tz={project.data.timezone} canChange={canChange} />;
}

function NewDelivery({ projectId }: { projectId: string }) {
  const project = useProject(projectId);
  const post = useCapability(projectId, 'deliveries.post');
  const nav = useDeliveriesNav(projectId);
  if (project.isPending || post.isPending) return <LoadingState label="Opening the form" />;
  if (project.isError) return <ErrorState error={project.error} onRetry={() => void project.refetch()} />;
  if (post.isError) return <ErrorState error={post.error} onRetry={() => void post.refetch()} />;
  if (!post.data) return <EmptyState title="You can't post deliveries on this job." />;
  const tz = project.data.timezone;
  return <PostDelivery projectId={projectId} tz={tz} day={nav.day ?? todayInZone(tz)} onPosted={nav.open} />;
}

export function DeliveryItem({ projectId, itemId }: DeliveryItemProps) {
  if (itemId === NEW_ITEM) return <NewDelivery projectId={projectId} />;
  return <ExistingDelivery key={itemId} projectId={projectId} itemId={itemId} />;
}
