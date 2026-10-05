// The permit's rev lists (Revs, 0056 rev_lists.permit_id): each list with how many of its walls are done, a tap opens
// Revs on the job. For those who read revs; nothing when no list is on this permit.
import { useMemo } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { ChevronRight } from 'lucide-react';
import { useCapability } from '../../data/queries';
import { useRevSetup, useRevStatus } from '../../data/revs.queries';
import type { RevSetup } from '../../data/revs.types';
import { Icon } from '../../ui/Icon';
import { PaneSection } from '../../ui/ReadingPane';
import { ErrorState } from '../../ui/States';
import { indexStatus, wallRevs, type StatusIndex } from '../revs/model';

interface PermitRevsProps {
  projectId: string;
  permitId: string;
}

interface ListTally {
  id: string;
  name: string;
  walls: number;
  done: number;
}

function tallies(setup: RevSetup, index: StatusIndex, permitId: string): ListTally[] {
  return setup.lists
    .filter((l) => l.permit_id === permitId)
    .map((l) => {
      const areas = setup.areas.filter((a) => a.list_id === l.id);
      const done = areas.filter((a) =>
        wallRevs(setup, index, a).every((r) => r.cells.every((c) => c.cell.status === 'passed' || c.cell.status === 'na')),
      ).length;
      return { id: l.id, name: [l.name, l.phase].filter(Boolean).join(' · '), walls: areas.length, done };
    });
}

function Lists({ projectId, permitId }: PermitRevsProps) {
  const navigate = useNavigate();
  const setup = useRevSetup(projectId);
  const status = useRevStatus(projectId);
  const index = useMemo(() => indexStatus(status.data ?? []), [status.data]);
  const failed = setup.isError ? setup : status.isError ? status : null;
  if (failed) return <ErrorState className="m-0" error={failed.error} title="The revs did not load." onRetry={() => void failed.refetch()} />;
  if (!setup.data || !status.data) return null;
  const rows = tallies(setup.data, index, permitId);
  if (rows.length === 0) return null;
  return (
    <PaneSection title="Revs" testId="permit-revs">
      <ul className="flex flex-col divide-y divide-line">
        {rows.map((r) => (
          <li key={r.id}>
            <button
              type="button"
              className="flex w-full items-center gap-2 py-1.5 text-left hover:text-accent"
              data-testid="permit-rev-list"
              onClick={() => {
                void navigate({ to: '/p/$projectId/$tool', params: { projectId, tool: 'revs' } });
              }}
            >
              <span className="min-w-0 flex-1 break-words text-[13.5px] font-medium leading-5 text-ink">{r.name}</span>
              <span className="shrink-0 text-[12.5px] tabular-nums text-ink-2" data-testid="permit-rev-tally">
                {`${String(r.done)} of ${String(r.walls)} walls done`}
              </span>
              <Icon icon={ChevronRight} size={16} className="shrink-0 text-ink-3" />
            </button>
          </li>
        ))}
      </ul>
    </PaneSection>
  );
}

export function PermitRevs(props: PermitRevsProps) {
  const read = useCapability(props.projectId, 'revs.read');
  return read.data === true ? <Lists {...props} /> : null;
}
