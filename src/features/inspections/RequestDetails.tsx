// A request's body: what to inspect, then only the notes that exist (the inspector's note for the GC, a GC return
// reason, the postponement, the result, the helper's report) and "View IR" once there is one.
import type { ReactNode } from 'react';
import { FileText } from 'lucide-react';
import type { IrRequest } from '../../data/inspections.types';
import { formatDay, formatInZone } from '../../lib/dates';
import { Button } from '../../ui/Button';
import { attendanceLabel, postponeLabel, resultLabel } from './model';

interface RequestDetailsProps {
  row: IrRequest;
  tz: string;
  viewing: boolean;
  onViewIr: () => void;
}

function Note({ label, children, testId }: { label: string; children: ReactNode; testId?: string | undefined }) {
  return (
    <div className="mt-3" data-testid={testId}>
      <p className="text-xs font-medium text-ink-2">{label}</p>
      <div className="whitespace-pre-wrap break-words text-sm text-ink">{children}</div>
    </div>
  );
}

export function RequestDetails({ row, tz, viewing, onViewIr }: RequestDetailsProps) {
  const result = resultLabel(row.result);
  const attendance = attendanceLabel(row.attendance);
  return (
    <div>
      <Note label="Items">{row.items}</Note>
      {row.gc_note ? <Note label={row.status === 'returned' ? 'Returned' : 'GC note'}>{row.gc_note}</Note> : null}
      {row.confirm_note ? <Note label="Inspector note">{row.confirm_note}</Note> : null}
      {attendance ? <Note label="Attendance">{attendance}</Note> : null}
      {row.status === 'postponed' ? (
        <Note label="Postponed" testId="ir-postponed">
          {postponeLabel(row.postpone_reason)}
          {row.postpone_until ? ` · expected ${formatDay(row.postpone_until, 'EEE, MMM d')}` : ''}
          {row.postpone_note ? `\n${row.postpone_note}` : ''}
        </Note>
      ) : null}
      {result ? (
        <Note label="Result" testId="ir-outcome">
          {result}
          {row.result_note ? `\n${row.result_note}` : ''}
        </Note>
      ) : null}
      {row.helper_report ? (
        <Note label="Helper">
          {row.helper_report === 'passed' ? 'Passed' : 'Issues'}
          {row.helper_note ? `\n${row.helper_note}` : ''}
        </Note>
      ) : null}
      {row.ir_file_id ? (
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <Button variant="primary" icon={FileText} loading={viewing} onClick={onViewIr} data-testid="ir-view-ir">
            View IR
          </Button>
          {row.results_sent_at ? (
            <span className="text-sm text-ink-2">Results sent {formatInZone(row.results_sent_at, tz, 'MMM d, h:mm a')}</span>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
