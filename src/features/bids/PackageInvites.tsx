// One package's invites (coverage row opened): who, company, status, and per bidder Resend (the server revokes the old
// link, mints a fresh permanent one and emails it; the new link is one tap to copy) and Remove access (with Undo; for
// people who manage the job's members). Invite opens the invite form with this package picked. Names come from
// people_display only.
import { useState } from 'react';
import { RotateCw, Send, UserX } from 'lucide-react';
import { useInviteBidders } from '../../data/bids.mutations';
import { useBidInvites, useBidPackages } from '../../data/bids.queries';
import type { InviteRow, PackageRow } from '../../data/bids.types';
import { messageOf } from '../../data/errors';
import { useRevokeMember } from '../../data/mutations';
import { useCapability, usePeopleDisplay } from '../../data/queries';
import { Button } from '../../ui/Button';
import { EmptyState, ErrorState, LoadingState } from '../../ui/States';
import { ReadingPane } from '../../ui/ReadingPane';
import { StatusChip } from '../../ui/StatusChip';
import { useToast } from '../../ui/Toast';
import { copyLink } from './InviteBiddersForm';
import { bidderName, inviteChip } from './model';
import { useBidsNav } from './useBidsNav';

interface InviteLineProps {
  projectId: string;
  pkg: PackageRow;
  invite: InviteRow;
  name: string;
  company: string | null;
  canRevoke: boolean;
  onHide: (memberId: string, hidden: boolean) => void;
}

function InviteLine({ projectId, pkg, invite: i, name, company, canRevoke, onHide }: InviteLineProps) {
  const resend = useInviteBidders();
  const revoke = useRevokeMember();
  const toast = useToast();
  const chip = inviteChip(i.status);

  function sendAgain() {
    if (i.email === null) return;
    resend.mutate(
      { project_id: projectId, package_ids: [pkg.id], recipients: [{ email: i.email }] },
      {
        onSuccess: (r) => {
          const sent = r.invited[0];
          if (!sent) {
            toast.show({ tone: 'error', message: `Not sent to ${name}.` });
            return;
          }
          toast.show({
            message: `Sent again to ${name}.`,
            durationMs: 8000,
            action: {
              label: 'Copy link',
              onClick: () => {
                copyLink(sent.link_url, toast);
              },
            },
          });
        },
        onError: (e) => {
          toast.show({ tone: 'error', message: `Not sent: ${messageOf(e)}` });
        },
      },
    );
  }

  function removeAccess() {
    onHide(i.member_id, true);
    toast.show({
      message: `Removing access for ${name}.`,
      durationMs: 6000,
      action: {
        label: 'Undo',
        onClick: () => {
          onHide(i.member_id, false);
        },
      },
      onCommit: () => {
        revoke.mutate(
          { projectId, memberId: i.member_id },
          {
            onError: (e) => {
              onHide(i.member_id, false);
              toast.show({ tone: 'error', message: `${name} still has access: ${messageOf(e)}` });
            },
          },
        );
      },
    });
  }

  return (
    <li className="flex flex-wrap items-start gap-x-3 gap-y-1.5 py-2" data-testid="package-invite">
      <div className="min-w-0 flex-1">
        <p className="break-words text-ink">{name}</p>
        {company !== null ? <p className="break-words text-xs text-ink-2">{company}</p> : null}
        {i.decline_reason ? <p className="break-words text-xs text-ink-2">{i.decline_reason}</p> : null}
      </div>
      <StatusChip status={chip.status} label={chip.label} />
      <div className="flex gap-1">
        {i.email !== null ? (
          <Button size="sm" variant="quiet" icon={RotateCw} loading={resend.isPending} data-testid="invite-resend" onClick={sendAgain}>
            Resend
          </Button>
        ) : null}
        {canRevoke ? (
          <Button size="sm" variant="quiet" icon={UserX} aria-label={`Remove access for ${name}`} data-testid="invite-revoke" onClick={removeAccess} />
        ) : null}
      </div>
    </li>
  );
}

interface PackageInvitesProps {
  projectId: string;
  packageId: string;
}

export function PackageInvites({ projectId, packageId }: PackageInvitesProps) {
  const packages = useBidPackages(projectId);
  const invites = useBidInvites(projectId);
  const people = usePeopleDisplay(projectId);
  const members = useCapability(projectId, 'members.manage');
  const nav = useBidsNav(projectId);
  const [hidden, setHidden] = useState<ReadonlySet<string>>(new Set());

  if (packages.isPending || invites.isPending) return <LoadingState label="Loading invites" />;
  if (packages.isError) return <ErrorState error={packages.error} onRetry={() => void packages.refetch()} />;
  if (invites.isError) return <ErrorState error={invites.error} onRetry={() => void invites.refetch()} />;
  const pkg = packages.data.find((p) => p.id === packageId);
  if (!pkg) return <EmptyState title="That package is gone." />;

  const onHide = (memberId: string, hide: boolean) => {
    setHidden((s) => {
      const next = new Set(s);
      if (hide) next.add(memberId);
      else next.delete(memberId);
      return next;
    });
  };
  const rows = invites.data.filter((i) => i.package_id === packageId && !hidden.has(i.member_id));
  const invite = (
    <Button
      size="sm"
      variant="primary"
      icon={Send}
      data-testid="package-invite-more"
      onClick={() => {
        nav.invite(pkg.id);
      }}
    >
      Invite
    </Button>
  );
  return (
    <ReadingPane number={pkg.code} title={pkg.name} actions={invite}>
      {rows.length === 0 ? <EmptyState title="No one invited." /> : null}
      <ul className="divide-y divide-line">
        {rows.map((i) => {
          const person = people.data?.find((p) => p.member_id === i.member_id);
          return (
            <InviteLine
              key={i.id}
              projectId={projectId}
              pkg={pkg}
              invite={i}
              name={bidderName(person)}
              company={person?.company ? person.full_name : null}
              canRevoke={members.data === true}
              onHide={onHide}
            />
          );
        })}
      </ul>
    </ReadingPane>
  );
}
