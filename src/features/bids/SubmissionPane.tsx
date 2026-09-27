// One received bid: receipt, the file (one click), Extract -> findings to confirm, and money for pricing roles.
// The AI only drafts; a person confirms (CLAUDE.md rule 12).
import type { ReactNode } from 'react';
import { Check, ScanText } from 'lucide-react';
import { useConfirmExtraction, useExtractBid } from '../../data/bids.mutations';
import { useBidExtraction, useBidPackages, useBidSubmissions } from '../../data/bids.queries';
import type { SubmissionRow } from '../../data/bids.types';
import { messageOf } from '../../data/errors';
import { FunctionError } from '../../data/functions';
import { usePeopleDisplay, useProject } from '../../data/queries';
import { formatInZone } from '../../lib/dates';
import { Button } from '../../ui/Button';
import { ReadingPane } from '../../ui/ReadingPane';
import { EmptyState, ErrorState, LoadingState } from '../../ui/States';
import { StatusChip } from '../../ui/StatusChip';
import { useToast } from '../../ui/Toast';
import { FileLine } from './FileLine';
import { Findings } from './Findings';
import { bidderName } from './model';
import { PricingLines } from './PricingLines';

function extractMessage(e: unknown): string {
  if (e instanceof FunctionError && e.status === 409) return 'Text not ready. Try again in a minute.';
  return messageOf(e);
}

function Extraction({ projectId, submissionId }: { projectId: string; submissionId: string }) {
  const extraction = useBidExtraction(projectId, submissionId);
  const extract = useExtractBid();
  const confirm = useConfirmExtraction();
  const toast = useToast();

  if (extraction.isPending) return <LoadingState label="Loading findings" />;
  if (extraction.isError) return <ErrorState error={extraction.error} onRetry={() => void extraction.refetch()} />;
  const x = extraction.data;
  if (x === null) {
    return (
      <div className="flex flex-col gap-2">
        <Button
          icon={ScanText}
          loading={extract.isPending}
          data-testid="bid-extract"
          onClick={() => {
            extract.mutate({ projectId, submissionId });
          }}
        >
          Extract
        </Button>
        {extract.isError ? <p className="text-sm text-danger">{extractMessage(extract.error)}</p> : null}
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-3">
      <Findings x={x} />
      <PricingLines projectId={projectId} extractionId={x.id} />
      {x.status === 'confirmed' ? (
        <StatusChip status="confirmed" />
      ) : (
        <Button
          variant="primary"
          icon={Check}
          loading={confirm.isPending}
          onClick={() => {
            confirm.mutate(
              { projectId, id: x.id, version: x.version },
              {
                onError: (e) => {
                  toast.show({ tone: 'error', message: `Not confirmed: ${messageOf(e)}` });
                },
              },
            );
          }}
        >
          Confirm
        </Button>
      )}
    </div>
  );
}

interface SubmissionPaneProps {
  projectId: string;
  submissionId: string;
  /** The bidder as the leveling board names it (sub company, extracted name); else people_display decides. */
  bidder?: string | undefined;
  /** Leveling: the row actions, above the findings. */
  actions?: ReactNode | undefined;
}

function meta(s: SubmissionRow, tz: string) {
  return (
    <span className="flex flex-wrap items-center gap-2">
      <span>
        Receipt #{s.receipt_number} · {formatInZone(s.received_at, tz, 'MMM d, yyyy h:mm a')}
        {s.version_no > 1 ? ` · v${String(s.version_no)}` : ''}
      </span>
      {s.is_late ? <StatusChip status="postponed" label="Late" /> : null}
    </span>
  );
}

export function SubmissionPane({ projectId, submissionId, bidder, actions }: SubmissionPaneProps) {
  const subs = useBidSubmissions(projectId, true);
  const packages = useBidPackages(projectId);
  const people = usePeopleDisplay(projectId);
  const project = useProject(projectId);

  if (subs.isPending || project.isPending) return <LoadingState label="Loading bid" />;
  if (subs.isError) return <ErrorState error={subs.error} onRetry={() => void subs.refetch()} />;
  if (project.isError) return <ErrorState error={project.error} onRetry={() => void project.refetch()} />;
  const s = subs.data.find((x) => x.id === submissionId);
  if (!s) return <EmptyState title="That bid is not here." />;

  const code = packages.data?.find((p) => p.id === s.package_id)?.code;
  return (
    <ReadingPane
      number={code}
      title={bidder ?? bidderName(people.data?.find((p) => p.member_id === s.member_id))}
      meta={meta(s, project.data.timezone)}
    >
      <ul className="mb-4">
        <FileLine fileId={s.file_id} />
      </ul>
      {actions ? <div className="mb-4">{actions}</div> : null}
      <Extraction projectId={projectId} submissionId={s.id} />
    </ReadingPane>
  );
}
