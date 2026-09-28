// The frame every opened board line shares: what the record is (its tool's icon, type and number), its name, the job
// and when the line happened, my tasks about it with Done in place, then the record's facts and its actions: open it
// where it lives, and download it when there is something to download.
import type { ReactNode } from 'react';
import { ArrowUpRight, Check, type LucideIcon } from 'lucide-react';
import type { OpenExtra } from '../../app/frame/useOpenTarget';
import type { TaskRow } from '../../data/types';
import { formatInZone } from '../../lib/dates';
import { Button } from '../../ui/Button';
import { Icon } from '../../ui/Icon';
import { ReadingPane } from '../../ui/ReadingPane';
import { StatusChip } from '../../ui/StatusChip';
import { useTaskDone } from './useTaskDone';

/** What the board line gives every record's pane. */
export interface ItemFrame {
  projectId: string;
  /** The job's time zone: every time shows on the job's clock. */
  zone: string;
  /** "Sample Job A · Fri Sep 25, 1:00 PM": which job, and when the line happened. */
  meta: string;
  /** The owning tool's icon (the board's for a line that belongs nowhere). */
  icon: LucideIcon;
  /** "Open in Files" and how to get there; null when no tool owns the record. */
  open: { label: string; go: (extra?: OpenExtra) => void } | null;
  /** My open tasks about this record. */
  tasks: readonly TaskRow[];
  onPrev?: (() => void) | undefined;
  onNext?: (() => void) | undefined;
  onOpenWindow?: (() => void) | undefined;
}

export interface KindProps {
  frame: ItemFrame;
  /** The record's id (activity.entity_id). */
  id: string;
}

type Fact = [label: string, value: ReactNode];

/** Label / value rows; rows without a value are left out. */
export function Facts({ rows }: { rows: readonly (Fact | null)[] }) {
  const shown = rows.filter((r): r is Fact => r !== null && r[1] !== null && r[1] !== undefined && r[1] !== '');
  if (shown.length === 0) return null;
  return (
    <dl className="grid grid-cols-[6rem_minmax(0,1fr)] gap-x-3 gap-y-2.5">
      {shown.map(([label, value]) => (
        <div key={label} className="contents">
          <dt className="text-ink-2">{label}</dt>
          <dd className="whitespace-pre-wrap break-words text-ink">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

function TaskStrip({ task, zone, busy, onDone }: { task: TaskRow; zone: string; busy: boolean; onDone: (t: TaskRow) => void }) {
  return (
    <div data-testid="item-task" className="flex items-center gap-3 rounded-md border border-accent/20 bg-accent-soft px-3 py-2.5">
      <div className="min-w-0 flex-1">
        <p className="break-words font-medium text-ink">{task.title}</p>
        {task.due_at ? <p className="text-xs text-ink-2">Due {formatInZone(task.due_at, zone, 'MMM d')}</p> : null}
      </div>
      {task.requires_signature ? (
        <StatusChip status="pending" label="Needs your signature" />
      ) : (
        <Button
          size="sm"
          variant="secondary"
          icon={Check}
          loading={busy}
          onClick={() => {
            onDone(task);
          }}
        >
          Done
        </Button>
      )}
    </div>
  );
}

interface EntityPaneProps {
  frame: ItemFrame;
  /** What it is: "File", "IR 12", "Delivery #3", "CN-004". */
  label: string;
  /** Its own name: the file name, the company, the title. */
  title: string;
  download?: { label: string; loading: boolean; onClick: () => void } | undefined;
  openExtra?: OpenExtra | undefined;
  children?: ReactNode | undefined;
}

export function EntityPane({ frame, label, title, download, openExtra, children }: EntityPaneProps) {
  const { done, busyId } = useTaskDone();
  const { open } = frame;
  return (
    <ReadingPane
      eyebrow={
        <>
          <Icon icon={frame.icon} size={16} className="text-accent" />
          <span data-testid="item-kind">{label}</span>
        </>
      }
      title={title}
      meta={frame.meta}
      onPrev={frame.onPrev}
      onNext={frame.onNext}
      onOpenWindow={frame.onOpenWindow}
      actions={
        open ? (
          <Button
            icon={ArrowUpRight}
            onClick={() => {
              open.go(openExtra);
            }}
          >
            {open.label}
          </Button>
        ) : undefined
      }
      onDownload={download?.onClick}
      downloading={download?.loading}
      downloadLabel={download?.label}
    >
      <div data-testid="board-item" className="flex flex-col gap-4">
        {frame.tasks.map((t) => (
          <TaskStrip key={t.id} task={t} zone={frame.zone} busy={busyId === t.id} onDone={done} />
        ))}
        {children}
      </div>
    </ReadingPane>
  );
}
