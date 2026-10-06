// The bidder's page (SPEC §11.4): one plain column of cards, phone-friendly. Only what this bidder may see:
// the job, their packages, addenda, answers, their own questions, and the plans and specs.
import { useEffect, type ReactNode } from 'react';
import { messageOf } from '../../data/errors';
import { markInviteOpened, useBidderPage } from '../../data/bidder';
import type { BidderPage as Page } from '../../data/bids.types';
import { useMyProjects } from '../../data/queries';
import { formatInZone } from '../../lib/dates';
import { Card } from '../../ui/Card';
import { PageHeader } from '../../ui/PageHeader';
import { ErrorState, LoadingState } from '../../ui/States';
import { TOOL_META } from '../../ui/tools';
import { useToast } from '../../ui/Toast';
import { BidderAddenda } from './BidderAddenda';
import { BidderDocuments } from './BidderDocuments';
import { BidderPackageCard } from './BidderPackageCard';
import { BidderQA } from './BidderQA';
import { UploadList } from '../files/UploadList';
import { dueRelative } from './pipeline';

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-[12px] font-bold uppercase tracking-wide text-ink">{label}</dt>
      <dd className="mt-0.5 text-sm font-medium text-ink">{children}</dd>
    </div>
  );
}

/** The job at the top: its name, who runs it, where, and the facts a bidder prices against. */
function ProjectCard({ project, gc, packages }: { project: Page['project']; gc: string | null; packages: number }) {
  const place = [gc, project.number, project.address].filter((s): s is string => s !== null && s !== '').join(' · ');
  const rel = project.bid_due_at !== null ? dueRelative(project.bid_due_at, project.timezone) : null;
  return (
    <Card>
      <h2 className="break-words text-xl font-semibold leading-7 tracking-[-0.01em] text-ink">{project.name}</h2>
      {place !== '' ? <p className="mt-0.5 break-words text-sm text-ink-2">{place}</p> : null}
      <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-3 border-t border-line pt-4 sm:grid-cols-3">
        <Fact label="Bid due">
          {project.bid_due_at !== null ? (
            <>
              <span className="tabular-nums">{formatInZone(project.bid_due_at, project.timezone, 'MMM d, yyyy h:mm a')}</span>
              {rel !== null && rel !== 'past' ? (
                <span className={`block text-xs font-normal ${rel === 'today' || rel === 'tomorrow' ? 'text-accent' : 'text-ink-2'}`}>{rel}</span>
              ) : null}
            </>
          ) : (
            <span className="font-normal text-ink-3">Not set</span>
          )}
        </Fact>
        <Fact label="Prevailing wage">{project.prevailing_wage ? 'Yes' : 'No'}</Fact>
        <Fact label="Packages">
          <span className="tabular-nums">{packages}</span>
        </Fact>
      </dl>
    </Card>
  );
}

/** The header's count line: what's here and what still needs this bidder. */
function metaLine(p: Page): string {
  const toAck = p.addenda.filter((a) => a.acked_at === null).length;
  const parts = [`${String(p.packages.length)} ${p.packages.length === 1 ? 'package' : 'packages'}`];
  if (toAck > 0) parts.push(`${String(toAck)} ${toAck === 1 ? 'addendum' : 'addenda'} to acknowledge`);
  return parts.join(' · ');
}

export function BidderPage({ projectId }: { projectId: string }) {
  const page = useBidderPage(projectId);
  // The company running the job, from my own jobs list (the page itself carries only the job).
  const projects = useMyProjects();
  const gc = projects.data?.find((j) => j.project_id === projectId)?.org_name ?? null;
  const toast = useToast();

  // Opening the page tells the estimator it was opened. A failure is said, not only logged.
  useEffect(() => {
    markInviteOpened(projectId).catch((e: unknown) => {
      console.error('mark_invite_opened failed', e);
      toast.show({ tone: 'error', message: `Your visit wasn't recorded: ${messageOf(e)}` });
    });
  }, [projectId, toast]);

  if (page.isPending || page.isError) {
    return (
      <div>
        <PageHeader title={TOOL_META.bids.label} icon={TOOL_META.bids.icon} />
        <Card padded={false}>
          {page.isError ? <ErrorState error={page.error} onRetry={() => void page.refetch()} /> : <LoadingState label="Loading your bid page" />}
        </Card>
      </div>
    );
  }

  const p = page.data;
  return (
    <div data-testid="bidder-page">
      <PageHeader title={TOOL_META.bids.label} icon={TOOL_META.bids.icon} meta={metaLine(p)} />
      <div className="flex flex-col gap-4">
        <ProjectCard project={p.project} gc={gc} packages={p.packages.length} />
        {p.upload_folder_id !== null ? (
          // The bid going up (one queue for the page): progress, Stop, Retry; then its receipt number.
          <div className="overflow-hidden rounded-card bg-card shadow-card empty:hidden">
            <UploadList folderId={p.upload_folder_id} />
          </div>
        ) : null}
        {p.packages.map((pkg) => (
          <BidderPackageCard key={pkg.id} projectId={projectId} pkg={pkg} folderId={p.upload_folder_id} tz={p.project.timezone} />
        ))}
        {p.addenda.length > 0 ? <BidderAddenda projectId={projectId} addenda={p.addenda} tz={p.project.timezone} /> : null}
        <BidderQA projectId={projectId} page={p} />
        <BidderDocuments projectId={projectId} />
      </div>
    </div>
  );
}
