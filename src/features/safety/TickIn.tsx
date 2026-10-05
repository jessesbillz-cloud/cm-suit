// The leader ticks in people on the job who are there but don't scan (one button per person; a tap adds them, a second
// tap takes them off with Undo). Their line says "Ticked in"; if they also sign from the QR, the signature completes it,
// and taking that line off says the signature goes with it. Who shows: the people who build the work (their role holds
// corrections.mark_ready, read from the capability matrix); a tailgate shows only them, any other meeting shows them
// first and then everyone else. Anyone already on the sheet keeps their button.
import { messageOf } from '../../data/errors';
import { usePeopleDisplay } from '../../data/queries';
import { useRemoveLine, useTickIn } from '../../data/safety.mutations';
import { useBuilderRoles } from '../../data/safety.queries';
import type { Signin } from '../../data/safety.types';
import type { Person } from '../../data/types';
import type { MeetingKind } from '../../lib/safety';
import { ChipPick } from '../../ui/ChipPick';
import { ErrorState, LoadingState } from '../../ui/States';
import { useToast } from '../../ui/Toast';

interface TickInProps {
  projectId: string;
  meetingId: string;
  kind: MeetingKind;
  lines: readonly Signin[];
}

/** The buttons, in order: builders first; at a tailgate only builders (and whoever is already on the sheet). */
function crewOf(people: readonly Person[], builders: readonly string[], kind: MeetingKind, onSheet: readonly string[]) {
  const active = people.filter((p): p is Person & { user_id: string } => p.status === 'active' && p.user_id !== null);
  const builds = (p: Person) => builders.includes(p.role);
  const shown = kind === 'tailgate' ? active.filter((p) => builds(p) || onSheet.includes(p.user_id)) : active;
  return [...shown.filter(builds), ...shown.filter((p) => !builds(p))].map((p) => ({ value: p.user_id, label: p.full_name }));
}

export function TickIn({ projectId, meetingId, kind, lines }: TickInProps) {
  const people = usePeopleDisplay(projectId);
  const builders = useBuilderRoles();
  const tick = useTickIn(projectId, meetingId);
  const remove = useRemoveLine(projectId);
  const toast = useToast();
  const error = people.error ?? builders.error;
  if (error) {
    return (
      <ErrorState
        error={error}
        onRetry={() => {
          void people.refetch();
          void builders.refetch();
        }}
        className="m-0"
      />
    );
  }
  if (people.isPending || builders.isPending) return <LoadingState label="Loading the crew" />;

  const onSheet = lines.flatMap((l) => (l.person_id ? [l.person_id] : []));
  const crew = crewOf(people.data, builders.data, kind, onSheet);
  if (crew.length === 0) return null;
  const fail = (e: unknown) => {
    toast.show({ tone: 'error', message: messageOf(e) });
  };

  function change(next: string[]) {
    for (const id of next.filter((x) => !onSheet.includes(x))) tick.mutate(id, { onError: fail });
    for (const id of onSheet.filter((x) => !next.includes(x))) {
      const line = lines.find((l) => l.person_id === id);
      if (!line) continue;
      const signed = line.signed_at !== null;
      remove.mutate(
        { signinId: line.id, removed: true },
        {
          onError: fail,
          onSuccess: () => {
            toast.show({
              message: signed ? `${line.name} taken off. Signature removed.` : `${line.name} taken off.`,
              action: { label: 'Undo', onClick: () => { remove.mutate({ signinId: line.id, removed: false }, { onError: fail }); } },
            });
          },
        },
      );
    }
  }

  return (
    <section className="flex flex-col gap-2" data-testid="safety-crew">
      <h2 className="text-sm font-semibold text-ink">Tick in</h2>
      <ChipPick chips={crew} picked={onSheet} onChange={change} label="Tick in" multiple testId="safety-tick" />
    </section>
  );
}
