// Small pieces every Requirements screen shares: the kind chip (neutral, not a status), the due words (red when late),
// the status chip (lib/status colors) and the one-tap status buttons (ui/ChipPick: no button lit = open).
import type { Requirement } from '../../data/requirements.types';
import { kindLabel, REQUIREMENT_STATUSES, requiredLabel, statusOf, type RequirementStatus } from '../../lib/requirements';
import { ChipPick, type Chip } from '../../ui/ChipPick';
import { StatusChip } from '../../ui/StatusChip';
import { dueWords } from './model';

export function KindChip({ row }: { row: Pick<Requirement, 'kind'> }) {
  return (
    <span className="inline-flex h-[22px] shrink-0 items-center whitespace-nowrap rounded-full border border-line-strong/80 bg-card-head px-2 text-xs font-medium text-ink-2">
      {kindLabel(row.kind)}
    </span>
  );
}

/** "Optional" / "If applicable" beside the title; nothing for a required line. */
export function RequiredNote({ row }: { row: Pick<Requirement, 'required'> }) {
  if (row.required === 'yes') return null;
  return <span className="whitespace-nowrap text-xs font-medium text-ink-3">{requiredLabel(row.required)}</span>;
}

export function DueText({ row, testId }: { row: Pick<Requirement, 'due_on' | 'days_left' | 'status'>; testId?: string | undefined }) {
  const due = dueWords(row);
  if (!due) return null;
  return (
    <span data-testid={testId} data-late={due.late ? 'true' : undefined} className={`whitespace-nowrap tabular-nums ${due.late ? 'font-medium text-danger' : ''}`}>
      {due.text}
    </span>
  );
}

export function StatusOf({ status }: { status: RequirementStatus }) {
  const s = statusOf(status);
  return <StatusChip status={s.chip} label={s.label} />;
}

/** The buttons a list row shows (Waived lives on the line's own screen); the line's screen shows them all. */
const SHORT: readonly RequirementStatus[] = ['requested', 'scheduled', 'done', 'na'];

interface StatusPickProps {
  status: RequirementStatus;
  onPick: (status: RequirementStatus) => void;
  short?: boolean | undefined;
  testId: string;
}

export function StatusPick({ status, onPick, short = false, testId }: StatusPickProps) {
  const chips: Chip<RequirementStatus>[] = REQUIREMENT_STATUSES.filter((s) => s.value !== 'open' && (!short || SHORT.includes(s.value))).map((s) => ({
    value: s.value,
    label: s.label,
    // A list row's four buttons fit one phone line without the dots.
    ...(short ? {} : { mark: <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: `var(--status-${s.chip}-dot)` }} /> }),
  }));
  return (
    <ChipPick<RequirementStatus>
      chips={chips}
      picked={status === 'open' ? [] : [status]}
      label="Status"
      testId={testId}
      onChange={(picked) => {
        onPick(picked[0] ?? 'open');
      }}
    />
  );
}
