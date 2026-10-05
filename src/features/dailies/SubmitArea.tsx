// The report's bottom bar while it is being written: the autosave line and Submit (a signed record, SPEC §6.9). A report
// changed after signing shows "Changed since signed" and Update & resubmit instead: its stored PDF is out of date and is
// never offered as current. Before signing, everything waiting is done first (`settle`: photos removed a moment ago),
// so the signed PDF is exactly what is on screen. Once submitted and current, the report shows SubmittedPanel instead.
import type { ReactNode } from 'react';
import { RefreshCw } from 'lucide-react';
import { useSubmitDaily } from '../../data/dailies.mutations';
import type { DailyReportRow } from '../../data/dailies.types';
import { StatusChip } from '../../ui/StatusChip';
import { useToast } from '../../ui/Toast';
import { SignButton } from '../auth/SignButton';

interface SubmitAreaProps {
  projectId: string;
  report: DailyReportRow;
  stale: boolean;
  /** Everything typed is saved and no photo is still uploading. */
  ready: boolean;
  /** Runs before signing and is waited for (pending photo removals); a failure stops the signing. */
  settle: () => Promise<void>;
  /** The saved version the signature covers. */
  savedVersion: () => number;
  onSigned: () => void;
  /** Left of the button: the autosave line. */
  aside?: ReactNode | undefined;
}

export function SubmitArea({ projectId, report, stale, ready, settle, savedVersion, onSigned, aside }: SubmitAreaProps) {
  const submit = useSubmitDaily(projectId);
  const toast = useToast();
  const signed = async () => {
    await settle();
    return submit.mutateAsync({ reportId: report.id, version: savedVersion() });
  };
  const done = () => {
    toast.show({ message: 'Report submitted.' });
    onSigned();
  };

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        {stale ? (
          <span>
            <StatusChip status="postponed" label="Changed since signed" />
          </span>
        ) : null}
        {aside}
      </div>
      <div className="ml-auto min-w-0">
        <SignButton
          label={stale ? 'Update & resubmit' : 'Submit'}
          testId="daily-submit"
          size="lg"
          icon={stale ? RefreshCw : undefined}
          pending={submit.isPending}
          disabled={!ready}
          sign={signed}
          onSigned={done}
        />
      </div>
    </div>
  );
}
