// One package's invites (coverage row opened): who, company, status. Names come from people_display only.
import { useBidInvites, useBidPackages } from '../../data/bids.queries';
import { usePeopleDisplay } from '../../data/queries';
import { EmptyState, ErrorState, LoadingState } from '../../ui/States';
import { ReadingPane } from '../../ui/ReadingPane';
import { StatusChip } from '../../ui/StatusChip';
import { bidderName, inviteChip } from './model';

interface PackageInvitesProps {
  projectId: string;
  packageId: string;
}

export function PackageInvites({ projectId, packageId }: PackageInvitesProps) {
  const packages = useBidPackages(projectId);
  const invites = useBidInvites(projectId);
  const people = usePeopleDisplay(projectId);

  if (packages.isPending || invites.isPending) return <LoadingState label="Loading invites" />;
  if (packages.isError) return <ErrorState error={packages.error} onRetry={() => void packages.refetch()} />;
  if (invites.isError) return <ErrorState error={invites.error} onRetry={() => void invites.refetch()} />;
  const pkg = packages.data.find((p) => p.id === packageId);
  if (!pkg) return <EmptyState title="That package is gone." />;

  const rows = invites.data.filter((i) => i.package_id === packageId);
  return (
    <ReadingPane number={pkg.code} title={pkg.name}>
      {rows.length === 0 ? <EmptyState title="No one invited." /> : null}
      <ul className="divide-y divide-line">
        {rows.map((i) => {
          const person = people.data?.find((p) => p.member_id === i.member_id);
          const chip = inviteChip(i.status);
          return (
            <li key={i.id} className="flex items-start gap-3 py-2">
              <div className="min-w-0 flex-1">
                <p className="break-words text-ink">{bidderName(person)}</p>
                {person?.company ? <p className="break-words text-xs text-ink-2">{person.full_name}</p> : null}
                {i.decline_reason ? <p className="break-words text-xs text-ink-2">{i.decline_reason}</p> : null}
              </div>
              <StatusChip status={chip.status} label={chip.label} />
            </li>
          );
        })}
      </ul>
    </ReadingPane>
  );
}
