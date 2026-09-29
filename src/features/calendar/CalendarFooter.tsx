// The calendar's footer (MDR): Share copies a job's scheduling link (its inspections page; people sign in through
// their invite link), Subscribe opens my calendar feed in the right column. On "All my jobs" with several jobs, Share
// first asks which job.
import { useState } from 'react';
import { Link2, Rss } from 'lucide-react';
import { Button } from '../../ui/Button';
import { useToast } from '../../ui/Toast';
import { schedulingLink } from './model';

interface CalendarFooterProps {
  /** The jobs whose scheduling link I can share (inspections on, and I'm on the job team). */
  jobs: readonly { project_id: string; name: string }[];
  onSubscribe: () => void;
}

export function CalendarFooter({ jobs, onSubscribe }: CalendarFooterProps) {
  const toast = useToast();
  const [picking, setPicking] = useState(false);

  function copy(projectId: string) {
    setPicking(false);
    navigator.clipboard.writeText(schedulingLink(window.location.origin, __BASE_PATH__, projectId)).then(
      () => {
        toast.show({ message: 'Scheduling link copied.' });
      },
      (e: unknown) => {
        console.warn('clipboard write failed', e);
        toast.show({ tone: 'error', message: 'Could not copy the link.' });
      },
    );
  }

  const only = jobs.length === 1 ? jobs[0] : undefined;
  return (
    <div className="flex flex-wrap items-center justify-end gap-2 border-t border-line bg-card-head px-3 py-2.5 sm:px-4">
      {picking ? (
        <div role="group" aria-label="Share which job" className="mr-auto flex min-w-0 flex-wrap items-center gap-1.5">
          {jobs.map((j) => (
            <Button
              key={j.project_id}
              size="sm"
              variant="quiet"
              className="h-9 border border-line bg-card sm:h-8"
              onClick={() => {
                copy(j.project_id);
              }}
            >
              {j.name}
            </Button>
          ))}
        </div>
      ) : null}
      {jobs.length > 0 ? (
        <Button
          size="sm"
          icon={Link2}
          className="h-10 sm:h-8"
          aria-pressed={picking}
          data-testid="cal-share"
          onClick={() => {
            if (only) copy(only.project_id);
            else setPicking(!picking);
          }}
        >
          Share
        </Button>
      ) : null}
      <Button size="sm" icon={Rss} className="h-10 sm:h-8" data-testid="cal-subscribe" onClick={onSubscribe}>
        Subscribe
      </Button>
    </div>
  );
}
