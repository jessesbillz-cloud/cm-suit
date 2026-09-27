// People on the job (names and companies from people_display only). Managers invite and remove access.
// Removing access waits for the toast to close so Undo works (no "are you sure?").
import { useState } from 'react';
import { UserMinus } from 'lucide-react';
import { useUser } from '../../data/auth';
import { useRevokeMember } from '../../data/mutations';
import { useCapability, usePeopleDisplay, useProject } from '../../data/queries';
import { messageOf } from '../../data/errors';
import type { Person } from '../../data/types';
import { humanize } from '../../lib/format';
import { Button } from '../../ui/Button';
import { Card } from '../../ui/Card';
import { EmptyState, ErrorState, LoadingState } from '../../ui/States';
import { useToast } from '../../ui/Toast';
import { InviteForm } from './InviteForm';

interface PersonLineProps {
  person: Person;
  isMe: boolean;
  canManage: boolean;
  onRemove: (p: Person) => void;
}

function PersonLine({ person, isMe, canManage, onRemove }: PersonLineProps) {
  return (
    <li className="flex items-center gap-3 px-4 py-2.5" data-testid="person">
      <div className="min-w-0 flex-1">
        <p className="break-words text-sm text-ink">
          {person.full_name}
          {isMe ? <span className="text-ink-2"> (you)</span> : null}
        </p>
        <p className="text-xs text-ink-2">{[person.company, humanize(person.role)].filter((s) => s).join(' · ')}</p>
      </div>
      {canManage && !isMe ? (
        <Button size="sm" variant="danger" icon={UserMinus} onClick={() => {
            onRemove(person);
          }}
        >
          Remove access
        </Button>
      ) : null}
    </li>
  );
}

export function PeopleTool({ projectId }: { projectId: string }) {
  const people = usePeopleDisplay(projectId);
  const manage = useCapability(projectId, 'members.manage');
  const project = useProject(projectId);
  const revoke = useRevokeMember();
  const user = useUser();
  const toast = useToast();
  const [pending, setPending] = useState<ReadonlySet<string>>(new Set());

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
  const projectName = project.data?.name ?? 'this job';
  const visible = (people.data ?? []).filter((p) => !pending.has(p.member_id));

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-4">
      {canManage && project.data ? (
        <InviteForm projectId={projectId} projectName={projectName} timeZone={project.data.timezone} />
      ) : null}
      <Card title="People on this job" padded={false}>
        {people.isPending ? <LoadingState label="Loading people" /> : null}
        {people.isError ? <ErrorState error={people.error} onRetry={() => void people.refetch()} /> : null}
        {people.isSuccess && visible.length === 0 ? <EmptyState title="Nobody else is on this job yet." /> : null}
        {visible.length > 0 ? (
          <ul className="divide-y divide-line">
            {visible.map((p) => (
              <PersonLine key={p.member_id} person={p} isMe={p.user_id === user.id} canManage={canManage} onRemove={remove} />
            ))}
          </ul>
        ) : null}
      </Card>
    </div>
  );
}
