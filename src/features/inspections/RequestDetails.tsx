// A request's body: who asked through the public link (if they did), what to inspect, an OFS request's answer to
// "Special inspection required?" (with the notice on Yes), then only the notes that exist (the inspector's note for the
// GC, a GC return reason, the postponement, the result, the helper's report) in one card, and "View IR" once there is
// one (it opens the IR full screen in the file viewer; Download beside it saves it in one click). An OFS request with
// walls shows its walls, items and why each failed below (RevCells), so they aren't repeated here.
import type { ReactNode } from 'react';
import { Download, FileText } from 'lucide-react';
import type { IrRequest } from '../../data/inspections.types';
import { formatDay, formatInZone } from '../../lib/dates';
import { Button } from '../../ui/Button';
import { SPECIAL_NOTICE, attendanceLabel, postponeLabel, resultLabel } from './model';

interface RequestDetailsProps {
  row: IrRequest;
  tz: string;
  onViewIr: () => void;
  onDownloadIr: () => void;
  downloading: boolean;
  /** View IR is the pane's main button unless the inspector's steps have their own. */
  viewIsMain: boolean;
  /** Its walls and items show on their own (an OFS request with walls). */
  walls: boolean;
  /** My Attendance step card shows it: not repeated here, so the steps don't jump under my finger when I tap it. */
  attendanceInSteps?: boolean | undefined;
}

function Note({ label, children, testId }: { label: string; children: ReactNode; testId?: string | undefined }) {
  return (
    <div className="px-3 py-2.5" data-testid={testId}>
      <p className="text-xs font-medium text-ink-3">{label}</p>
      <div className="whitespace-pre-wrap break-words text-sm leading-6 text-ink">{children}</div>
    </div>
  );
}

/** A request sent through the public link (0055): who asked, and how to reach them (tap to call or write). */
function ViaLink({ row }: { row: IrRequest }) {
  if (row.requester_name === null) return null;
  return (
    <Note label="Via link" testId="ir-via-link">
      <span className="block">
        {row.requester_name} · {row.company}
      </span>
      <span className="flex flex-wrap gap-x-4">
        {row.requester_phone ? (
          <a className="font-medium text-accent hover:underline" href={`tel:${row.requester_phone.replace(/[^0-9+]/g, '')}`}>
            {row.requester_phone}
          </a>
        ) : null}
        {row.requester_email ? (
          <a className="break-all font-medium text-accent hover:underline" href={`mailto:${row.requester_email}`}>
            {row.requester_email}
          </a>
        ) : null}
      </span>
    </Note>
  );
}

export function RequestDetails({ row, tz, onViewIr, onDownloadIr, downloading, viewIsMain, walls, attendanceInSteps = false }: RequestDetailsProps) {
  const result = resultLabel(row.result);
  const attendance = attendanceInSteps ? null : attendanceLabel(row.attendance);
  const special = row.kind === 'ofs' ? row.special_required : null;
  const notes =
    !walls ||
    special !== null ||
    row.requester_name !== null ||
    Boolean(row.gc_note) ||
    Boolean(row.confirm_note) ||
    attendance !== null ||
    row.status === 'postponed' ||
    result !== null ||
    Boolean(row.helper_report);
  if (!notes && !row.ir_file_id) return null;
  return (
    <div className="flex flex-col gap-3">
      {notes ? (
        <div className="divide-y divide-line rounded-lg border border-line">
          <ViaLink row={row} />
          {walls ? null : <Note label="Items">{row.items}</Note>}
          {special !== null ? (
            <Note label="Special inspection" testId="ir-special">
              {special ? `Yes\n${SPECIAL_NOTICE}` : 'No'}
            </Note>
          ) : null}
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
              {row.result_note && !walls ? `\n${row.result_note}` : ''}
            </Note>
          ) : null}
          {row.helper_report ? (
            <Note label="Helper">
              {row.helper_report === 'passed' ? 'Passed' : 'Issues'}
              {row.helper_note ? `\n${row.helper_note}` : ''}
            </Note>
          ) : null}
        </div>
      ) : null}
      {row.ir_file_id ? (
        <div className="flex flex-wrap items-center gap-3">
          <Button variant={viewIsMain ? 'primary' : 'secondary'} icon={FileText} onClick={onViewIr} data-testid="ir-view-ir">
            View IR
          </Button>
          <Button icon={Download} loading={downloading} onClick={onDownloadIr} data-testid="ir-download-ir">
            Download
          </Button>
          {row.results_sent_at ? (
            <span className="text-sm text-ink-2">Results sent {formatInZone(row.results_sent_at, tz, 'MMM d, h:mm a')}</span>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
