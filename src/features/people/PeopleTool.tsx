// People on the job (names, companies and Invited / Active from people_display only; role names in the words of
// roles.description). Managers invite and remove access. Removing access waits for the toast to close so Undo works
// (no "are you sure?"). Below the people, who sends the job's OFS requests (DutyCard, 0091).
import { useState, type ReactNode } from 'react';
import { UserMinus, UserPlus } from 'lucide-react';
import { useUser } from '../../data/auth';
import { useRevokeMember } from '../../data/mutations';
import { useCapability, usePeopleDisplay, useProject, useRoles } from '../../data/queries';
import { messageOf } from '../../data/errors';
import type { Person } from '../../data/types';
import { Button } from '../../ui/Button';
import { Card } from '../../ui/Card';
import { PageHeader } from '../../ui/PageHeader';
import { EmptyState, ErrorState, LoadingState } from '../../ui/States';
import { StatusChip } from '../../ui/StatusChip';
import { useToast } from '../../ui/Toast';
import { TOOL_META } from '../../ui/tools';
import { DutyCard } from './DutyCard';
import { InviteForm, roleLabel } from './InviteForm';

const META = TOOL_META.people;

/** "Sample Reviewer" -> "SR"; one word -> its first letter. */
function initialsOf(name: string): string {
  const words = name.trim().split(/\s+/).filter((w) => w !== '');
  const first = words[0]?.[0] ?? '';
  const last = words.length > 1 ? (words[words.length - 1]?.[0] ?? '') : '';
  return `${first}${last}`.toUpperCase() || '?';
}

function Avatar({ name, me }: { name: string; me: boolean }) {
  return (
    <span
      aria-hidden
      className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[13px] font-semibold tracking-wide ${
        me ? 'bg-accent text-white' : 'bg-accent-soft text-accent'
      }`}
    >
      {initialsOf(name)}
    </span>
  );
}

function RoleChip({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex h-[22px] items-center whitespace-nowrap rounded-full border border-line bg-card-head px-2 text-xs font-medium text-ink-2">
      {children}
    </span>
  );
}

interface PersonLineProps {
  person: Person;
  /** The role in words (roles.description). */
  role: string;
  isMe: boolean;
  canManage: boolean;
  onRemove: (p: Person) => void;
}

function PersonLine({ person, role, isMe, canManage, onRemove }: PersonLineProps) {
  return (
    <li className="flex min-h-[60px] items-center gap-3 px-4 py-2.5" data-testid="person">
      <Avatar name={person.full_name} me={isMe} />
      <div className="min-w-0 flex-1">
        <p className="break-words text-sm font-medium text-ink">
          {person.full_name}
          {isMe ? <span className="ml-1.5 text-xs font-normal text-ink-3">You</span> : null}
        </p>
        {person.company ? <p className="break-words text-[13px] text-ink-2">{person.company}</p> : null}
      </div>
      <span className="flex shrink-0 flex-wrap justify-end gap-1.5 sm:w-56 sm:justify-start">
        <RoleChip>{role}</RoleChip>
        {/* Invited: the link is out, not opened yet. Active needs no chip. */}
        {person.status === 'invited' ? <StatusChip status="pending" label="Invited" /> : null}
      </span>
      {canManage ? (
        <span className="flex w-10 shrink-0 justify-end">
          {isMe ? null : (
            <Button
              variant="quiet"
              icon={UserMinus}
              aria-label={`Remove access for ${person.full_name}`}
              title="Remove access"
              onClick={() => {
                onRemove(person);
              }}
            />
          )}
        </span>
      ) : null}
    </li>
  );
}

export function PeopleTool({ projectId }: { projectId: string }) {
  const people = usePeopleDisplay(projectId);
  const manage = useCapability(projectId, 'members.manage');
  const project = useProject(projectId);
  const roles = useRoles();
  const revoke = useRevokeMember();
  const user = useUser();
  const toast = useToast();
  const [pending, setPending] = useState<ReadonlySet<string>>(new Set());
  const [inviting, setInviting] = useState(false);

  const setPendingFor = (memberId: string, on: boolean) => {
    setPending((s) => {
      const next = new Set(s);
      if (on) next.add(memberId);
      else next.delete(memberId);
      return next;
    });
  };

  function remove(p: Person) {
    setPendingFor(p.member_id, true);
    toast.show({
      message: `Removing access for ${p.full_name}.`,
      durationMs: 6000,
      action: {
        label: 'Undo',
        onClick: () => {
          setPendingFor(p.member_id, false);
        },
      },
      onCommit: () => {
        revoke.mutate(
          { projectId, memberId: p.member_id },
          {
            onError: (e) => {
              toast.show({ tone: 'error', message: `${p.full_name} still has access: ${messageOf(e)}` });
            },
            onSettled: () => {
              setPendingFor(p.member_id, false);
            },
          },
        );
      },
    });
  }

  const canManage = manage.data === true;
  // Who may invite and the job's name come first: a failure there shows, never a silently missing Invite.
  const failed = manage.isError ? manage : project.isError ? project : null;
  const projectName = project.data?.name ?? 'this job';
  const visible = (people.data ?? []).filter((p) => !pending.has(p.member_id));
  const count = people.isSuccess ? `${String(visible.length)} ${visible.length === 1 ? 'person' : 'people'}` : undefined;
  const inviteButton =
    canManage && project.data && !inviting ? (
      <Button
        variant="primary"
        icon={UserPlus}
        onClick={() => {
          setInviting(true);
        }}
      >
        Invite
      </Button>
    ) : undefined;

  return (
    <div className="flex flex-col">
      <PageHeader title={META.label} icon={META.icon} meta={count} actions={inviteButton} />
      <div className="flex flex-col gap-4">
        {canManage && project.data && inviting ? (
          <InviteForm
            projectId={projectId}
            projectName={projectName}
            timeZone={project.data.timezone}
            onClose={() => {
              setInviting(false);
            }}
          />
        ) : null}
        {failed ? <ErrorState error={failed.error} onRetry={() => void failed.refetch()} /> : null}
        <Card padded={false} className="overflow-hidden">
          {people.isPending ? <LoadingState label="Loading people" /> : null}
          {people.isError ? <ErrorState error={people.error} onRetry={() => void people.refetch()} /> : null}
          {people.isSuccess && visible.length === 0 ? <EmptyState icon={META.icon} title="Nobody else is on this job yet." /> : null}
          {visible.length > 0 ? (
            <ul className="divide-y divide-line">
              {visible.map((p) => (
                <PersonLine
                  key={p.member_id}
                  person={p}
                  role={roleLabel(p.role, roles.data)}
                  isMe={p.user_id === user.id}
                  canManage={canManage}
                  onRemove={remove}
                />
              ))}
            </ul>
          ) : null}
        </Card>
        <DutyCard projectId={projectId} />
      </div>
    </div>
  );
}
