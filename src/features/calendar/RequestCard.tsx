// One request in the day under the calendar (MDR's request card): a rail in its status color, the job (on "All my
// jobs") or the type as the title, the type and company, the IR number and its state, a time · length chip, the items,
// its files (one click each downloads) and, once the IR is made, View IR (MDR's "View Completed IR"; one click). The
// whole card opens the request in the right column, where the inspector's steps are (inspections' RequestPane).
// Someone else's request shows only its time, type and color.
import { FileText, Pause, Paperclip } from 'lucide-react';
import { messageOf } from '../../data/errors';
import { useDownloadIrFile } from '../../data/inspections.mutations';
import { useIrFileNames } from '../../data/inspections.queries';
import { useCapability } from '../../data/queries';
import { formatDay } from '../../lib/dates';
import { Icon } from '../../ui/Icon';
import { StatusChip } from '../../ui/StatusChip';
import { useToast } from '../../ui/Toast';
import { attendanceLabel, postponeLabel, rowChip, typeLabel } from '../inspections/model';
import { clockLabel, durationLabel } from '../inspections/time';
import type { IrEntry } from './entries';

interface RequestCardProps {
  entry: IrEntry;
  showJob: boolean;
  selected: boolean;
  /** Done requests recede, as in MDR. */
  done: boolean;
  onOpen: (entry: IrEntry) => void;
}

const CHIP = 'inline-flex h-6 items-center gap-1 rounded-md px-2 text-xs font-medium';

function Files({ entry }: { entry: IrEntry }) {
  const { row } = entry;
  const ids = row.attachment_ids;
  const names = useIrFileNames(entry.projectId, ids);
  const download = useDownloadIrFile();
  const toast = useToast();
  return (
    <div className="relative z-10 flex flex-wrap gap-1.5 px-3.5 pt-2.5">
      {ids.map((id, i) => (
        <button
          key={id}
          type="button"
          disabled={download.isPending && download.variables.fileId === id}
          className="inline-flex min-h-8 max-w-full items-center gap-1.5 rounded-md border border-line bg-card px-2.5 py-1 text-left text-[13px] text-ink hover:border-line-strong hover:bg-page/60 disabled:opacity-60"
          onClick={() => {
            if (row.id === null) return;
            download.mutate(
              { requestId: row.id, fileId: id },
              {
                onError: (e) => {
                  toast.show({ tone: 'error', message: messageOf(e) });
                },
              },
            );
          }}
        >
          <Icon icon={Paperclip} size={14} className="shrink-0 text-ink-3" />
          <span className="min-w-0 wrap-anywhere">{names.data?.[id] ?? `File ${String(i + 1)}`}</span>
        </button>
      ))}
    </div>
  );
}

/** The IR once made (a complete request has its IR on file; Delete PDF takes it back to confirmed). */
function ViewIr({ requestId }: { requestId: string }) {
  const download = useDownloadIrFile();
  const toast = useToast();
  return (
    <div className="relative z-10 px-3.5 pt-2.5">
      <button
        type="button"
        disabled={download.isPending}
        data-testid="cal-view-ir"
        className="inline-flex min-h-8 items-center gap-1.5 rounded-md border border-line bg-card px-2.5 py-1 text-[13px] font-medium text-accent hover:border-line-strong hover:bg-page/60 disabled:opacity-60"
        onClick={() => {
          download.mutate(
            { requestId },
            {
              onError: (e) => {
                toast.show({ tone: 'error', message: messageOf(e) });
              },
            },
          );
        }}
      >
        <Icon icon={FileText} size={14} className="shrink-0" />
        View IR
      </button>
    </div>
  );
}

function Chips({ entry }: { entry: IrEntry }) {
  const { row } = entry;
  const attendance = attendanceLabel(row.attendance);
  const when = row.duration_kind === 'all_day' ? 'All day' : `${clockLabel(row.start_time)} · ${durationLabel(row.duration_kind, row.duration_min)}`;
  return (
    <div className="flex flex-wrap gap-1.5 px-3.5 pt-2.5">
      <span className={`${CHIP} bg-page tabular-nums text-ink`}>{when}</span>
      {row.status === 'postponed' ? (
        <span className={CHIP} style={{ color: 'var(--status-postponed-fg)', background: 'var(--status-postponed-bg)' }}>
          <Icon icon={Pause} size={12} />
          {postponeLabel(row.postpone_reason) || 'Postponed'}
          {row.postpone_until ? ` · expected ${formatDay(row.postpone_until, 'MMM d')}` : ''}
        </span>
      ) : null}
      {row.status !== 'postponed' && row.postpone_count > 0 ? (
        <span className={`${CHIP} bg-page text-ink-2`}>Postponed {row.postpone_count}×</span>
      ) : null}
      {attendance ? <span className={`${CHIP} bg-page text-ink-2`}>{attendance}</span> : null}
    </div>
  );
}

export function RequestCard({ entry, showJob, selected, done, onOpen }: RequestCardProps) {
  const { row } = entry;
  // The deputy reads an OFS request sent to OFS as Pending; everyone else as "With OFS" (cached per job).
  const ofsDecide = useCapability(entry.projectId, 'ir.ofs_decide');
  const chip = rowChip(row, ofsDecide.data === true);
  const type = typeLabel(row.kind, row.special_kind);
  const title = showJob ? entry.projectName : type;
  const sub = [showJob ? type : null, row.company].filter((v): v is string => v !== null && v !== '').join(' · ');
  const opens = row.full_detail && row.id !== null;
  return (
    <article
      data-testid="cal-request"
      className={`relative rounded-lg border border-l-4 border-line bg-card pb-3 shadow-control transition-shadow ${
        selected ? 'ring-2 ring-accent' : opens ? 'hover:shadow-card' : ''
      } ${done && !selected ? 'opacity-80' : ''}`}
      style={{ borderLeftColor: `var(--status-${chip.status}-dot)` }}
    >
      <div className="flex items-start gap-3 px-3.5 pt-3">
        <div className="min-w-0 flex-1">
          {opens ? (
            <button
              type="button"
              className="block wrap-anywhere text-left text-[15px] font-semibold leading-5 text-ink after:absolute after:inset-0 after:rounded-lg focus-visible:outline-none focus-visible:after:outline focus-visible:after:outline-2 focus-visible:after:outline-accent"
              onClick={() => {
                onOpen(entry);
              }}
            >
              {title}
            </button>
          ) : (
            <p className="break-words text-[15px] font-semibold leading-5 text-ink">{title}</p>
          )}
          {sub !== '' ? <p className="mt-0.5 break-words text-[13px] leading-5 text-ink-2">{sub}</p> : null}
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1 sm:flex-row sm:items-center sm:gap-2">
          {row.number !== null ? <span className="text-[13px] font-medium tabular-nums text-ink-2">IR {row.number}</span> : null}
          <StatusChip status={chip.status} label={chip.label} />
        </div>
      </div>
      <Chips entry={entry} />
      {row.items ? <p className="whitespace-pre-wrap break-words px-3.5 pt-2.5 text-sm leading-5 text-ink">{row.items}</p> : null}
      {row.attachment_ids.length > 0 ? <Files entry={entry} /> : null}
      {opens && row.id !== null && row.status === 'complete' ? <ViewIr requestId={row.id} /> : null}
    </article>
  );
}
