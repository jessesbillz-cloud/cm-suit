// The bidder's page (SPEC §11.4): one plain column of cards, phone-friendly. Only what this bidder may see:
// the job, their packages, addenda, answers, their own questions, and the plans and specs.
import { useEffect } from 'react';
import { markInviteOpened, useBidderPage } from '../../data/bidder';
import type { BidderPage as Page } from '../../data/bids.types';
import { formatInZone } from '../../lib/dates';
import { Card } from '../../ui/Card';
import { ErrorState, LoadingState } from '../../ui/States';
import { BidderAddenda } from './BidderAddenda';
import { BidderDocuments } from './BidderDocuments';
import { BidderPackageCard } from './BidderPackageCard';
import { BidderQA } from './BidderQA';

function ProjectCard({ project }: { project: Page['project'] }) {
  const facts = [
    project.bid_due_at ? `Bids due ${formatInZone(project.bid_due_at, project.timezone, 'MMM d, yyyy h:mm a')}` : null,
    `Prevailing wage: ${project.prevailing_wage ? 'Yes' : 'No'}`,
  ].filter((f): f is string => f !== null);
  return (
    <Card>
      <h1 className="break-words text-lg font-semibold text-ink">{project.name}</h1>
      <p className="text-sm text-ink-2">{[project.number, project.address].filter((s) => s).join(' · ')}</p>
      <ul className="mt-2 text-sm text-ink">
        {facts.map((f) => (
          <li key={f}>{f}</li>
        ))}
      </ul>
    </Card>
  );
}

export function BidderPage({ projectId }: { projectId: string }) {
  const page = useBidderPage(projectId);

  useEffect(() => {
    markInviteOpened(projectId).catch((e: unknown) => {
      console.error('mark_invite_opened failed', e);
    });
  }, [projectId]);

  if (page.isPending) return <LoadingState label="Loading your bid page" />;
  if (page.isError) return <ErrorState error={page.error} onRetry={() => void page.refetch()} />;

  const p = page.data;
  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-3" data-testid="bidder-page">
      <ProjectCard project={p.project} />
      {p.packages.map((pkg) => (
        <BidderPackageCard key={pkg.id} projectId={projectId} pkg={pkg} folderId={p.upload_folder_id} tz={p.project.timezone} />
      ))}
      {p.addenda.length > 0 ? <BidderAddenda projectId={projectId} addenda={p.addenda} tz={p.project.timezone} /> : null}
      <BidderQA projectId={projectId} page={p} />
      <BidderDocuments projectId={projectId} />
    </div>
  );
}
