// What a file row shows in its section (Jesse, Oct 11). Plans: Sheet, Title, Added, by sheet number. Submittals:
// Section (its number under it), Title (its company under it), Stamp: the title keeps its room beside the right column. Everything else: Name, Size, Added, as before. A name that says no sheet or
// submittal shows as it is. Desktop: columns. Phone: the sheet or section in front of the title, the rest on one short
// line under it. A stamp's color comes from lib/status only (text, never a row). A reader whose job is approve or not
// sees Approved or Not approved instead of the codes (Jesse, Oct 12).
import type { ReactNode } from 'react';
import type { FileRow } from '../../data/types';
import { formatInZone } from '../../lib/dates';
import { formatBytes } from '../../lib/format';
import { STATUS, stampOutcome, stampStatus } from '../../lib/status';
import type { SectionKind } from './classify';
import { stripExt } from './fileNames';
import type { RowView, StampMode } from './rowView';

const SIZE = 'w-16 shrink-0 text-right';
const DATE = 'w-[5.75rem] shrink-0 text-right';
const SHEET = 'w-20 shrink-0';
const SECTION = 'w-[4.75rem] shrink-0';
const STAMP = 'w-14 shrink-0';
/** Room for "Not approved". */
const OUTCOME = 'w-[4.75rem] shrink-0';
const stampCol = (stamps: StampMode) => (stamps === 'outcome' ? OUTCOME : STAMP);

interface Col {
  label: string;
  className: string;
}

/** The column names before and after the title, per section (the head lines them up with the rows). */
export function headCols(section: SectionKind, stamps: StampMode = 'codes'): { lead: Col[]; main: string; trail: Col[] } {
  if (section === 'plans') return { lead: [{ label: 'Sheet', className: SHEET }], main: 'Title', trail: [{ label: 'Added', className: DATE }] };
  if (section === 'submittals') {
    return {
      lead: [{ label: 'Section', className: SECTION }],
      main: 'Title',
      trail: [{ label: 'Stamp', className: stampCol(stamps) }],
    };
  }
  return {
    lead: [],
    main: 'Name',
    trail: [
      { label: 'Size', className: SIZE },
      { label: 'Added', className: DATE },
    ],
  };
}

const CELL = 'hidden text-xs tabular-nums text-ink-3 sm:block';

/** The stamp's codes, or Approved / Not approved for a reader whose job is approve or not (blank when unknown). */
function StampText({ stamp, stamps, testId }: { stamp: string; stamps: StampMode; testId?: string | undefined }) {
  if (stamps === 'unknown') return null;
  const outcome = stamps === 'outcome' ? stampOutcome(stamp) : null;
  if (stamps === 'outcome' && outcome === null) return null;
  const key = outcome ?? stampStatus(stamp);
  return (
    <span data-testid={testId} className="font-semibold" style={key ? { color: STATUS[key].fg } : undefined}>
      {outcome ? STATUS[outcome].label : stamp}
    </span>
  );
}

/** The cells before the title (desktop). */
export function LeadCells({ view }: { view: RowView }) {
  if (view.kind === 'sheet') {
    return <span className={`${CELL} ${SHEET} font-semibold text-ink`}>{view.sheet?.sheet ?? ''}</span>;
  }
  if (view.kind === 'submittal') {
    return (
      <>
        <span className={`${CELL} ${SECTION} text-ink`}>
          {view.sub?.section ?? ''}
          {view.sub?.no ? <span className="block text-ink-3">{view.sub.no}</span> : null}
        </span>
      </>
    );
  }
  return null;
}

interface TitleProps {
  view: RowView;
  file: FileRow;
  added: string;
  /** The scan state's chip, when the file is not a clean finished one: beside the title (desktop), under it (phone). */
  chip: ReactNode;
}

/** The title (or the name), and on a phone what the columns say, under it. */
export function TitleCell({ view, file, added, chip }: TitleProps) {
  const sub = view.kind === 'submittal' ? view.sub : null;
  const sheet = view.kind === 'sheet' ? view.sheet : null;
  const parsed = sheet?.title ?? sub?.title ?? null;
  const title = parsed === null ? file.original_name : parsed !== '' ? parsed : stripExt(file.original_name);
  const lead = sheet ? sheet.sheet : sub ? [sub.section, sub.no].filter((x) => x !== null).join(' · ') : null;
  const meta =
    view.kind === 'plain' ? [formatBytes(file.size), added] : view.kind === 'sheet' ? [added] : [view.company];
  return (
    <>
      {lead !== null ? <span className="mr-2 font-semibold text-ink sm:hidden">{lead}</span> : null}
      <span data-testid="file-row-name" className="wrap-anywhere font-medium text-ink group-hover:text-accent">
        {title}
      </span>
      {chip ? <span className="ml-2 hidden align-middle sm:inline-block">{chip}</span> : null}
      {/* The company under the title on a desktop too: a column of its own left the title no room beside the right column. */}
      {view.kind === 'submittal' && view.company !== '' ? (
        <span data-testid="file-row-company" className="mt-0.5 hidden text-xs text-ink-3 wrap-anywhere sm:block">
          {view.company}
        </span>
      ) : null}
      <span className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs tabular-nums text-ink-3 wrap-anywhere sm:hidden">
        {chip}
        {meta.filter((s) => s !== '').join(' · ')}
        {sub?.stamp && view.kind === 'submittal' ? <StampText stamp={sub.stamp} stamps={view.stamps} /> : null}
      </span>
    </>
  );
}

/** The cells after the title (desktop). */
export function TrailCells({ view, file, timeZone }: { view: RowView; file: FileRow; timeZone: string | null }) {
  const added = timeZone === null ? '' : formatInZone(file.created_at, timeZone, 'MMM d, yyyy');
  if (view.kind === 'submittal') {
    return (
      <>
        <span className={`${CELL} ${stampCol(view.stamps)}`}>{view.sub?.stamp ? <StampText stamp={view.sub.stamp} stamps={view.stamps} testId="file-row-stamp" /> : null}</span>
      </>
    );
  }
  return (
    <>
      {view.kind === 'plain' ? <span className={`${CELL} ${SIZE}`}>{formatBytes(file.size)}</span> : null}
      <span className={`${CELL} ${DATE}`}>{added}</span>
    </>
  );
}
