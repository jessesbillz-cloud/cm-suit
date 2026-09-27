// One received bid: receipt, the file (one click), Read -> findings to confirm, and money for pricing roles.
// The AI only drafts; a person confirms (CLAUDE.md rule 12). Reading an office-recorded bid also links its sub.
import type { ReactNode } from 'react';
import { Check, ScanText } from 'lucide-react';
import { useConfirmExtraction, useExtractBid } from '../../data/bids.mutations';
import {
  useBidExtraction,
  useBidExtractions,
  useBidPackages,
  useBidSubmissions,
  usePricingAccess,
  useReceivedFiles,
  useSubNames,
} from '../../data/bids.queries';
import type { SubmissionRow } from '../../data/bids.types';
import { messageOf } from '../../data/errors';
import { FunctionError } from '../../data/functions';
import { useFolders, useOrgSettings, usePeopleDisplay, useProject } from '../../data/queries';
import { formatInZone } from '../../lib/dates';
import { Button } from '../../ui/Button';
import { ReadingPane } from '../../ui/ReadingPane';
import { EmptyState, ErrorState, LoadingState } from '../../ui/States';
import { StatusChip } from '../../ui/StatusChip';
import { useToast } from '../../ui/Toast';
import { StepUp } from '../auth/StepUp';
import { FileLine } from './FileLine';
import { Findings } from './Findings';
import { bidderName } from './model';
import { PricingLines } from './PricingLines';

function extractMessage(e: unknown): string {
  if (e instanceof FunctionError && e.error === 'unreadable') return 'Open the file to read it.';
  if (e instanceof FunctionError && e.status === 409) return 'Text not ready. Try again in a minute.';
  return messageOf(e);
}

interface ExtractionProps {
  projectId: string;
  orgId: string;
  submission: SubmissionRow;
}

function Extraction({ projectId, orgId, submission }: ExtractionProps) {
  const submissionId = submission.id;
  const extraction = useBidExtraction(projectId, submissionId);
  const access = usePricingAccess(projectId);
  const extract = useExtractBid();
  const ai = useOrgSettings(orgId);
  const confirm = useConfirmExtraction();
  const toast = useToast();

  if (extraction.isPending || access.isPending) return <LoadingState label="Loading findings" />;
  if (extraction.isError) return <ErrorState error={extraction.error} onRetry={() => void extraction.refetch()} />;
  if (access.isError) return <ErrorState error={access.error} onRetry={() => void access.refetch()} />;
  const x = extraction.data;
  if (x === null) {
    // Findings are aal2-only like money: a pricing role that signed in with the email code alone sees nothing yet.
    if (access.data === 'two_factor') return <StepUp />;
    if (ai.data?.ai_bid_reading !== true) return <EmptyState title="Not read yet." />;
    return (
      <div className="flex flex-col gap-2">
        <Button
          icon={ScanText}
          loading={extract.isPending}
          data-testid="bid-extract"
          onClick={() => {
            extract.mutate({ projectId, orgId, submission });
          }}
        >
          Read
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
  const extractions = useBidExtractions(projectId, true);
  const files = useReceivedFiles(projectId, useFolders(projectId).data?.find((f) => f.kind === 'bids_received')?.id ?? null);
  const subNames = useSubNames(project.data?.org_id ?? null);

  if (subs.isPending || project.isPending) return <LoadingState label="Loading bid" />;
  if (subs.isError) return <ErrorState error={subs.error} onRetry={() => void subs.refetch()} />;
  if (project.isError) return <ErrorState error={project.error} onRetry={() => void project.refetch()} />;
  const s = subs.data.find((x) => x.id === submissionId);
  if (!s) return <EmptyState title="That bid is not here." />;

  const code = packages.data?.find((p) => p.id === s.package_id)?.code;
  const title =
    s.member_id !== null
      ? bidderName(people.data?.find((p) => p.member_id === s.member_id))
      : (subNames.data?.find((x) => x.id === s.sub_id)?.company ??
        extractions.data?.find((x) => x.submission_id === s.id)?.bidder_name ??
        files.data?.find((f) => f.id === s.file_id)?.original_name ??
        'Received bid');
  return (
    <ReadingPane number={code} title={bidder ?? title} meta={meta(s, project.data.timezone)}>
      <ul className="mb-4">
        <FileLine fileId={s.file_id} />
      </ul>
      {actions ? <div className="mb-4">{actions}</div> : null}
      <Extraction projectId={projectId} orgId={project.data.org_id} submission={s} />
    </ReadingPane>
  );
}
