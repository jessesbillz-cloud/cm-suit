// The weekly progress snapshot (MDR's progress page): counts by status, opened and closed this week (the project's
// week, Monday first), and the open list. Read-only; in its own window it prints clean. Publishing it with the
// weekly summary comes later.
import { ExternalLink, Printer } from 'lucide-react';
import { useCorrections } from '../../data/corrections.queries';
import { CORRECTION_STATUSES } from '../../data/corrections.types';
import { useProject } from '../../data/queries';
import { formatInZone, weekStartInZone } from '../../lib/dates';
import { Button } from '../../ui/Button';
import { ErrorState, LoadingState } from '../../ui/States';
import { StatusChip } from '../../ui/StatusChip';
import { cnLabel, statusChip, weeklySnapshot } from './model';

interface ProgressViewProps {
  projectId: string;
  /** In its own window: offer Print instead of "Open in new window". */
  standalone: boolean;
  onOpenWindow?: (() => void) | undefined;
}

function Stat({ label, value, testId }: { label: string; value: number; testId: string }) {
  return (
    <div className="rounded-card border border-line px-3 py-2">
      <dt className="text-xs text-ink-2">{label}</dt>
      <dd className="text-xl font-semibold tabular-nums text-ink" data-testid={testId}>
        {value}
      </dd>
    </div>
  );
}

export function ProgressView({ projectId, standalone, onOpenWindow }: ProgressViewProps) {
  const list = useCorrections(projectId);
  const project = useProject(projectId);

  if (list.isError) return <ErrorState error={list.error} onRetry={() => void list.refetch()} />;
  if (project.isError) return <ErrorState error={project.error} onRetry={() => void project.refetch()} />;
  if (list.isPending || project.isPending) return <LoadingState label="Loading progress" />;

  const tz = project.data.timezone;
  const weekStart = weekStartInZone(tz);
  const snap = weeklySnapshot(list.data, weekStart);

  return (
    <article className="flex flex-col gap-5 p-5" data-testid="cn-progress">
      <header className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <h1 className="text-base font-semibold text-ink">Corrections progress</h1>
          <p className="text-sm text-ink-2">
            {project.data.name} &middot; Week of {formatInZone(weekStart, tz, 'MMM d, yyyy')}
          </p>
        </div>
        {standalone ? (
          <Button
            icon={Printer}
            className="print:hidden"
            onClick={() => {
              window.print();
            }}
          >
            Print
          </Button>
        ) : onOpenWindow ? (
          <Button variant="quiet" icon={ExternalLink} onClick={onOpenWindow}>
            Open in new window
          </Button>
        ) : null}
      </header>

      <dl className="grid grid-cols-3 gap-3">
        <Stat label="Opened this week" value={snap.openedThisWeek} testId="cn-progress-opened" />
        <Stat label="Closed this week" value={snap.closedThisWeek} testId="cn-progress-closed" />
        <Stat label="Open" value={snap.open.length} testId="cn-progress-open" />
      </dl>

      <ul className="flex flex-wrap gap-3" aria-label="By status">
        {CORRECTION_STATUSES.map((s) => {
          const chip = statusChip(s);
          return (
            <li key={s} className="flex items-center gap-1.5 text-sm tabular-nums text-ink">
              <StatusChip status={chip.status} label={chip.label} />
              {snap.counts[s]}
            </li>
          );
        })}
      </ul>

      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-semibold text-ink">Open items</h2>
        {snap.open.length === 0 ? (
          <p className="text-sm text-ink-2">Nothing open.</p>
        ) : (
          <table className="w-full table-fixed border-collapse text-sm">
            <thead>
              <tr className="border-b border-line text-left text-xs text-ink-2">
                <th className="w-20 px-2 py-1.5 font-medium">No.</th>
                <th className="px-2 py-1.5 font-medium">Title</th>
                <th className="w-24 px-2 py-1.5 font-medium">Status</th>
                <th className="w-28 px-2 py-1.5 font-medium">Location</th>
                <th className="w-20 px-2 py-1.5 font-medium">Opened</th>
              </tr>
            </thead>
            <tbody>
              {snap.open.map((r) => {
                const chip = statusChip(r.status);
                return (
                  <tr key={r.id} className="border-b border-line align-top">
                    <td className="px-2 py-1.5 tabular-nums text-ink-2">{cnLabel(r.number)}</td>
                    <td className="whitespace-normal break-words px-2 py-1.5 text-ink">{r.title}</td>
                    <td className="px-2 py-1.5">
                      <StatusChip status={chip.status} label={chip.label} />
                    </td>
                    <td className="whitespace-normal break-words px-2 py-1.5 text-ink-2">{r.location}</td>
                    <td className="px-2 py-1.5 text-ink-2">{formatInZone(r.created_at, tz, 'MMM d')}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </section>
    </article>
  );
}
