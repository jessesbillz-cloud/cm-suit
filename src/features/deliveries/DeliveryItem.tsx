// A delivery in the right column (or full screen on a phone, or its own window): its receipt, photos, Edit / Delete for
// its poster and deliveries.manage, and its history behind one link. Item 'new' is the post form. Opened from somewhere
// else (the Calendar, the Board) the deliveries board behind it moves to the delivery's day. The receipt has no stored
// PDF, so it prints (SPEC §7.2's Download applies once the worker renders receipts).
import { useEffect, useRef, useState } from 'react';
import { ExternalLink, Pencil, Printer, Trash2 } from 'lucide-react';
import { useIsPhone } from '../../app/frame/useIsPhone';
import { useUser } from '../../data/auth';
import { useDelivery } from '../../data/deliveries.queries';
import { useRestoreDelivery } from '../../data/deliveries.mutations';
import type { DeliveryRow } from '../../data/deliveries.types';
import { messageOf } from '../../data/errors';
import { useCapability, useProject } from '../../data/queries';
import { todayInZone } from '../../lib/dates';
import { BehindLink } from '../../ui/BehindLink';
import { Button } from '../../ui/Button';
import { PaneSection } from '../../ui/ReadingPane';
import { EmptyState, ErrorState, LoadingState } from '../../ui/States';
import { useToast } from '../../ui/Toast';
import { DeleteBox } from './DeleteBox';
import { DeliveryPhotos } from './DeliveryPhotos';
import { EditDelivery } from './EditDelivery';
import { HistoryList } from './HistoryList';
import { ItemFrame } from './ItemFrame';
import { PostDelivery } from './PostDelivery';
import { PrintSheet } from './PrintSheet';
import { PrintedReceipt, ReceiptBody } from './Receipt';
import { NEW_ITEM, useDeliveriesNav } from './useDeliveriesNav';

interface DeliveryItemProps {
  projectId: string;
  itemId: string;
  /** Open in new window (the frame passes it on a desktop, outside a window of its own). */
  onOpenWindow?: (() => void) | undefined;
}

interface PaneProps {
  projectId: string;
  projectName: string;
  row: DeliveryRow;
  tz: string;
  canChange: boolean;
  onOpenWindow?: (() => void) | undefined;
}

type Mode = 'view' | 'edit' | 'delete' | 'print';

function DeliveryPane({ projectId, projectName, row, tz, canChange, onOpenWindow }: PaneProps) {
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
      <ItemFrame title={`Edit #${String(row.number)}`}>
        <EditDelivery projectId={projectId} row={row} tz={tz} onDone={toView} />
      </ItemFrame>
    );
  }

  return (
    <ItemFrame
      title={`Delivery #${String(row.number)}`}
      action={
        <>
          {onOpenWindow ? (
            <Button
              size="sm"
              variant="quiet"
              icon={ExternalLink}
              aria-label="Open in new window"
              title="Open in new window"
              data-testid="delivery-open-window"
              onClick={onOpenWindow}
            />
          ) : null}
          <Button size="sm" variant="quiet" icon={Printer} onClick={() => {
              setMode('print');
            }}>
            Print
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <PaneSection>
          <ReceiptBody delivery={receipt} tz={tz} />
        </PaneSection>
        {deleted ? (
          <div className="flex items-center gap-3 rounded-lg border border-line bg-card-head px-3.5 py-2.5">
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
        {canChange && !deleted && mode !== 'delete' ? (
          <div className="flex flex-wrap gap-2 border-t border-line pt-4">
            <Button icon={Pencil} onClick={() => {
                setMode('edit');
              }}>
              Edit
            </Button>
            <Button variant="danger" icon={Trash2} onClick={() => {
                setMode('delete');
              }}>
              Delete
            </Button>
          </div>
        ) : null}
        <BehindLink label="History" testId="delivery-history-link">
          <HistoryList projectId={projectId} deliveryId={row.id} tz={tz} />
        </BehindLink>
      </div>
      {mode === 'print' ? (
        <PrintSheet onClose={toView}>
          <PrintedReceipt projectName={projectName} delivery={receipt} tz={tz} />
        </PrintSheet>
      ) : null}
    </ItemFrame>
  );
}

function ExistingDelivery({ projectId, itemId, onOpenWindow }: DeliveryItemProps) {
  const q = useDelivery(projectId, itemId);
  const project = useProject(projectId);
  const post = useCapability(projectId, 'deliveries.post');
  const manage = useCapability(projectId, 'deliveries.manage');
  const me = useUser();
  const nav = useDeliveriesNav(projectId);
  // Opened with no day picked (from the Calendar, the Board, a link): the board behind shows the delivery's day.
  const date = q.data?.delivery_date ?? null;
  const showDay = nav.day === null && !nav.standalone ? date : null;
  const moved = useRef(false);
  const { showDayOf } = nav;
  useEffect(() => {
    if (showDay === null || moved.current) return;
    moved.current = true;
    showDayOf(itemId, showDay);
  }, [showDay, itemId, showDayOf]);

  if (q.isPending || project.isPending) return <LoadingState label="Loading the delivery" />;
  if (q.isError) return <ErrorState error={q.error} onRetry={() => void q.refetch()} />;
  if (project.isError) return <ErrorState error={project.error} onRetry={() => void project.refetch()} />;
  if (q.data === null) return <EmptyState title="This delivery is no longer here." />;
  const row = q.data;
  const canChange = manage.data === true || (row.created_by === me.id && post.data === true);
  return (
    <DeliveryPane
      projectId={projectId}
      projectName={project.data.name}
      row={row}
      tz={project.data.timezone}
      canChange={canChange}
      onOpenWindow={onOpenWindow}
    />
  );
}

function NewDelivery({ projectId }: { projectId: string }) {
  const isPhone = useIsPhone();
  const project = useProject(projectId);
  const post = useCapability(projectId, 'deliveries.post');
  const nav = useDeliveriesNav(projectId);
  if (project.isPending || post.isPending) return <LoadingState label="Opening the form" />;
  if (project.isError) return <ErrorState error={project.error} onRetry={() => void project.refetch()} />;
  if (post.isError) return <ErrorState error={post.error} onRetry={() => void post.refetch()} />;
  if (!post.data) return <EmptyState title="You can't post deliveries on this job." />;
  const tz = project.data.timezone;
  return <PostDelivery projectId={projectId} tz={tz} day={nav.day ?? todayInZone(tz)} onPosted={nav.open} isPhone={isPhone} />;
}

export function DeliveryItem({ projectId, itemId, onOpenWindow }: DeliveryItemProps) {
  if (itemId === NEW_ITEM) return <NewDelivery projectId={projectId} />;
  return <ExistingDelivery key={itemId} projectId={projectId} itemId={itemId} onOpenWindow={onOpenWindow} />;
}
