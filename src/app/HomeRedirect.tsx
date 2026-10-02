// "/" opens "All my jobs" (Jesse, Sep 28), on the desktop and the phone: the board of every job, or the calendar when
// that is my main default, so I see what needs me first and pick the job from there. No jobs yet: the setup flow.
import { Suspense } from 'react';
import { Navigate } from '@tanstack/react-router';
import { useMyProjects, useUserLayout } from '../data/queries';
import { ErrorState, LoadingState } from '../ui/States';
import { SetupFlow } from './lazyPages';

export function HomeRedirect() {
  const layout = useUserLayout();
  const projects = useMyProjects();

  if (layout.isPending || projects.isPending) return <LoadingState label="Opening your jobs" />;
  if (layout.isError) return <ErrorState error={layout.error} onRetry={() => void layout.refetch()} />;
  if (projects.isError) return <ErrorState error={projects.error} onRetry={() => void projects.refetch()} />;

  // No jobs yet: set up the company, then add the first job (SPEC §5.1).
  if (projects.data.length === 0) {
    return (
      <Suspense fallback={<LoadingState label="Opening your jobs" />}>
        <SetupFlow />
      </Suspense>
    );
  }

  return <Navigate to={layout.data.choices.main_default === 'calendar' ? '/all/calendar' : '/all/board'} replace />;
}
