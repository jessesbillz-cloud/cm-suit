// The leader ticks in people on the job who are there but don't scan (one button per person; a tap adds them, a second
// tap takes them off with Undo). Their line says "Ticked in"; if they also sign from the QR, the signature completes it.
import { messageOf } from '../../data/errors';
import { usePeopleDisplay } from '../../data/queries';
import { useRemoveLine, useTickIn } from '../../data/safety.mutations';
import type { Signin } from '../../data/safety.types';
import { ChipPick } from '../../ui/ChipPick';
import { ErrorState, LoadingState } from '../../ui/States';
import { useToast } from '../../ui/Toast';

interface TickInProps {
  projectId: string;
  meetingId: string;
  lines: readonly Signin[];
}

export function TickIn({ projectId, meetingId, lines }: TickInProps) {
  const people = usePeopleDisplay(projectId);
  const tick = useTickIn(projectId, meetingId);
  const remove = useRemoveLine(projectId);
  const toast = useToast();
  if (people.isError) return <ErrorState error={people.error} onRetry={() => void people.refetch()} className="m-0" />;
  if (people.isPending) return <LoadingState label="Loading the crew" />;

  const crew = people.data.flatMap((p) => (p.status === 'active' && p.user_id ? [{ value: p.user_id, label: p.full_name }] : []));
  if (crew.length === 0) return null;
  const onSheet = lines.flatMap((l) => (l.person_id ? [l.person_id] : []));
  const fail = (e: unknown) => {
    toast.show({ tone: 'error', message: messageOf(e) });
  };

  function change(next: string[]) {
    for (const id of next.filter((x) => !onSheet.includes(x))) tick.mutate(id, { onError: fail });
    for (const id of onSheet.filter((x) => !next.includes(x))) {
      const line = lines.find((l) => l.person_id === id);
      if (!line) continue;
      remove.mutate(
        { signinId: line.id, removed: true },
        {
          onError: fail,
          onSuccess: () => {
            toast.show({
              message: `${line.name} taken off.`,
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
