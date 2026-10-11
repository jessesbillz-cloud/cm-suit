// A new inspection request (SPEC §13.2): the job's access and the form's context load first; on an OFS job, its revs
// and rooms too (walls to pick replace typing the items, prefilled from the Revs link: ?areas=&items=). The form itself
// is RequestFormBody.
import { useSearch } from '@tanstack/react-router';
import { useIrFormContext } from '../../data/inspections.queries';
import { useRevSetup, useRevStatus } from '../../data/revs.queries';
import { useRevRooms } from '../../data/revs.rooms';
import { todayInZone } from '../../lib/dates';
import { ErrorState, LoadingState } from '../../ui/States';
import { listsWithWalls, prefillPick, statusIndex } from '../revs/revPick';
import { RequestFormBody, type BodyProps } from './RequestFormBody';
import { useSelectedDay } from './useInspectionsNav';
import { useIrAccess } from './useIrAccess';

/** The link from Revs: the walls and items to start from. */
interface PrefillSearch {
  areas?: string | undefined;
  items?: string | undefined;
}

type Common = Omit<BodyProps, 'revs'>;

/** An OFS job: its revs load with the form; walls to pick replace typing the items. */
function OfsRequestForm(props: Common) {
  const setup = useRevSetup(props.projectId);
  const status = useRevStatus(props.projectId);
  const rooms = useRevRooms(props.projectId);
  const search: PrefillSearch = useSearch({ strict: false });
  if (setup.isError) return <ErrorState error={setup.error} onRetry={() => void setup.refetch()} />;
  if (setup.isPending) return <LoadingState label="Loading the form" />;
  if (listsWithWalls(setup.data).length === 0) return <RequestFormBody {...props} revs={null} />;
  if (status.isError) return <ErrorState error={status.error} onRetry={() => void status.refetch()} />;
  if (rooms.isError) return <ErrorState error={rooms.error} onRetry={() => void rooms.refetch()} />;
  if (status.isPending || rooms.isPending) return <LoadingState label="Loading the form" />;
  const start = prefillPick(setup.data, statusIndex(status.data), search.areas, search.items);
  return <RequestFormBody {...props} revs={{ setup: setup.data, status: status.data, rooms: rooms.data, start }} />;
}

export function RequestForm({ projectId }: { projectId: string }) {
  const access = useIrAccess(projectId);
  const ctx = useIrFormContext(projectId);
  const search: PrefillSearch = useSearch({ strict: false });
  const zone = access.state === 'ready' ? access.job.tz : 'UTC';
  const day = useSelectedDay(todayInZone(zone));
  if (access.state === 'error') return <ErrorState error={access.error} onRetry={access.retry} />;
  if (ctx.isError) return <ErrorState error={ctx.error} onRetry={() => void ctx.refetch()} />;
  if (access.state === 'loading' || !ctx.data) return <LoadingState label="Loading the form" />;
  const props = { projectId, job: access.job, ctx: ctx.data, day, inspector: access.can.decide };
  // A new link from Revs (other walls, other items) starts a new form.
  const key = `${projectId}|${search.areas ?? ''}|${search.items ?? ''}`;
  return ctx.data.ofs ? <OfsRequestForm key={key} {...props} /> : <RequestFormBody key={projectId} {...props} revs={null} />;
}
