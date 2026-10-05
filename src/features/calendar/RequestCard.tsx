// One request in the day under the calendar (MDR's request card): a rail in its status color, the job (on "All my
// jobs") or the type as the title, the type and company, the IR number and its state, a time · length chip, the items,
// its files and, once the IR is made, View IR (MDR's "View Completed IR"): a tap opens it full screen in the file viewer
// (a photo, a PDF's pages; Download inside, arrows across the files), and the icon beside it downloads it in one click.
// The whole card opens the request in the right column, where the inspector's steps are (inspections' RequestPane).
// Someone else's request shows only its time, type and color.
import { useState } from 'react';
import { Download, FileText, LoaderCircle, Pause, Paperclip } from 'lucide-react';
import { downloadErrorMessage } from '../../data/download';
import { useIrFileNames } from '../../data/inspections.queries';
import { usePreviewFetch } from '../../data/preview';
import { useCapability } from '../../data/queries';
import { formatDay } from '../../lib/dates';
import { useFileViewer, type ViewerItem } from '../../ui/FileViewer';
import { Icon } from '../../ui/Icon';
import { StatusChip } from '../../ui/StatusChip';
import { useToast } from '../../ui/Toast';
import { irFileItems, irPdfItem } from '../inspections/irItems';
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

const SPLIT = 'relative z-10 inline-flex min-h-8 max-w-full items-stretch overflow-hidden rounded-md border border-line bg-card text-[13px]';
const SPLIT_MAIN = 'inline-flex min-w-0 items-center gap-1.5 px-2.5 py-1 text-left hover:bg-page/60';
const SPLIT_SAVE = 'flex w-8 shrink-0 items-center justify-center border-l border-line text-ink-3 hover:bg-page/60 hover:text-accent disabled:opacity-60';

/** One file on the card: its name opens the viewer (over `items` from `index`), the icon downloads it in one click. */
function FileChip({ items, index, main = false }: { items: readonly ViewerItem[]; index: number; main?: boolean | undefined }) {
  const viewer = useFileViewer();
  const toast = useToast();
  const [saving, setSaving] = useState(false);
  const item = items[index];
  if (!item) return null;
  return (
    <span className={SPLIT}>
      <button
        type="button"
        data-testid={main ? 'cal-view-ir' : 'cal-file'}
        className={`${SPLIT_MAIN} ${main ? 'font-medium text-accent' : 'text-ink'}`}
        onClick={() => {
          viewer.open(items, index);
        }}
      >
        <Icon icon={main ? FileText : Paperclip} size={14} className={`shrink-0 ${main ? '' : 'text-ink-3'}`} />
        <span className="min-w-0 wrap-anywhere">{main ? 'View IR' : item.name}</span>
      </button>
      <button
        type="button"
        aria-label={`Download ${item.name}`}
        title="Download"
        disabled={saving}
        className={SPLIT_SAVE}
        onClick={() => {
          setSaving(true);
          item
            .download()
            .catch((e: unknown) => {
              toast.show({ tone: 'error', message: downloadErrorMessage(e) });
            })
            .finally(() => {
              setSaving(false);
            });
        }}
      >
        <Icon icon={saving ? LoaderCircle : Download} size={14} className={saving ? 'animate-spin' : ''} />
      </button>
    </span>
  );
}

function Files({ entry, requestId }: { entry: IrEntry; requestId: string }) {
  const ids = entry.row.attachment_ids;
  const names = useIrFileNames(entry.projectId, ids);
  const preview = usePreviewFetch();
  const items = irFileItems(requestId, ids, names.data ?? {}, preview);
  return (
    <div className="flex flex-wrap gap-1.5 px-3.5 pt-2.5">
      {items.map((item, i) => (
        <FileChip key={item.id} items={items} index={i} />
      ))}
    </div>
  );
}

/** The IR once made (a complete request has its IR on file; Delete PDF takes it back to confirmed). */
function ViewIr({ requestId, number }: { requestId: string; number: number | null }) {
  return (
    <div className="px-3.5 pt-2.5">
      <FileChip items={[irPdfItem(requestId, number)]} index={0} main />
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
      {row.attachment_ids.length > 0 && row.id !== null ? <Files entry={entry} requestId={row.id} /> : null}
      {opens && row.id !== null && row.status === 'complete' ? <ViewIr requestId={row.id} number={row.number} /> : null}
    </article>
  );
}
