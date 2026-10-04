// Every activity of the current schedule, by start, with one search box (name, Activity ID, area, trade, WBS). A long
// schedule shows its first matches; searching narrows it.
import { useState } from 'react';
import { ChartGantt } from 'lucide-react';
import type { Activity } from '../../data/schedule.types';
import { Card } from '../../ui/Card';
import { SearchBox } from '../../ui/SearchBox';
import { EmptyState } from '../../ui/States';
import { ActivityRow } from './ActivityRow';
import { matches } from './model';

/** Rows drawn at once (a schedule can hold 5,000). */
const SHOWN = 400;

interface ActivitiesViewProps {
  activities: readonly Activity[];
  selectedId: string | null;
  onOpen: (id: string) => void;
}

export function ActivitiesView({ activities, selectedId, onOpen }: ActivitiesViewProps) {
  const [q, setQ] = useState('');
  const hits = activities.filter((a) => matches(a, q));
  return (
    <div className="flex flex-col gap-3" data-testid="schedule-activities">
      <div className="flex flex-wrap items-center gap-3">
        <SearchBox label="Search activities" placeholder="Search" onChange={setQ} testId="schedule-search" className="w-full sm:w-80" />
        <span className="text-[13px] tabular-nums text-ink-3" data-testid="schedule-count">
          {hits.length > SHOWN ? `${String(SHOWN)} of ${String(hits.length)}` : String(hits.length)}
        </span>
      </div>
      <Card padded={false} className="overflow-hidden">
        {hits.length === 0 ? (
          <EmptyState icon={ChartGantt} title={q.trim() ? 'No activity matches.' : 'No activities.'} />
        ) : (
          <ul className="divide-y divide-line">
            {hits.slice(0, SHOWN).map((a) => (
              <ActivityRow key={a.id} activity={a} selected={a.id === selectedId} onOpen={onOpen} />
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
