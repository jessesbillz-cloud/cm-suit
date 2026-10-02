// The permit log (Jesse, Sep 30 / Oct 1: "sort things by permit ... a permit log"): two tight lines per permit, by
// number. Line 1: the number and the WHOLE title (it wraps, never cut off), the job on the caseload, and at the right
// OSFM's status code for the stage (on a phone, the stage's name too). Line 2: the tracker with the days at each stage.
// A tap opens it in the right column. No columns, no View buttons.
import type { PermitListRow, PermitStep } from '../../data/permits.types';
import { phoneRowClass } from '../../ui/Table';
import { stageCode, stageLabel } from './model';
import { PermitSteps } from './PermitSteps';

interface PermitLogProps {
  rows: readonly PermitListRow[];
  /** Each permit's places (permit_progress); undefined while they load. */
  steps: ReadonlyMap<string, readonly PermitStep[]> | undefined;
  /** The caseload across jobs: each row names its job. */
  showJob: boolean;
  selectedId: string | null;
  isPhone: boolean;
  onOpen: (id: string) => void;
}

interface RowProps {
  row: PermitListRow;
  steps: readonly PermitStep[] | undefined;
  showJob: boolean;
  selected: boolean;
  isPhone: boolean;
  onOpen: (id: string) => void;
}

function Code({ stage, isPhone }: { stage: string; isPhone: boolean }) {
  const code = stageCode(stage);
  return (
    <span className="flex shrink-0 items-center gap-1.5 pt-0.5 text-[13px] leading-5" data-testid="permit-row-stage">
      {isPhone ? <span className="text-ink-2">{stageLabel(stage)}</span> : null}
      {code ? (
        <span title="OSFM status" className="rounded border border-line px-1 font-mono text-[11.5px] font-semibold tracking-wide text-ink-2">
          {code}
        </span>
      ) : null}
    </span>
  );
}

function Row({ row, steps, showJob, selected, isPhone, onOpen }: RowProps) {
  return (
    <li>
      <button
        type="button"
        data-testid={`permit-row-${row.primary_number}`}
        data-stage={row.stage}
        aria-current={selected ? 'true' : undefined}
        className={`${phoneRowClass(selected)} flex flex-col gap-2 ${selected ? '' : 'hover:bg-page/60'} ${isPhone ? '' : 'py-2.5'}`}
        onClick={() => {
          onOpen(row.id);
        }}
      >
        <span className="flex w-full items-start gap-3">
          <span className="min-w-0 flex-1 whitespace-normal break-words text-[15px] leading-6 text-ink">
            <span className="mr-2 font-semibold tabular-nums">{row.primary_number}</span>
            {row.title}
            {showJob ? <span className="ml-2 text-[13px] text-ink-3">{row.project_name}</span> : null}
          </span>
          <Code stage={row.stage} isPhone={isPhone} />
        </span>
        <span className="block w-full">
          {steps ? (
            <PermitSteps steps={steps} timeZone={row.timezone} size="sm" layout={isPhone ? 'dots' : 'one'} testId="permit-row-steps" />
          ) : (
            <span aria-hidden className="block h-8 w-full animate-pulse rounded-[5px] bg-page" />
          )}
        </span>
      </button>
    </li>
  );
}

export function PermitLog({ rows, steps, showJob, selectedId, isPhone, onOpen }: PermitLogProps) {
  return (
    <ul className="divide-y divide-line" data-testid="permit-log">
      {rows.map((r) => (
        <Row
          key={r.id}
          row={r}
          steps={steps === undefined ? undefined : (steps.get(r.id) ?? [])}
          showJob={showJob}
          selected={selectedId === r.id}
          isPhone={isPhone}
          onOpen={onOpen}
        />
      ))}
    </ul>
  );
}
