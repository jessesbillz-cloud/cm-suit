// Starting out (SPEC §5.1): no company yet -> "Set up your company"; then "Add a job", which opens the new job in my
// default tool. The same flow serves the first run (no jobs) and "New job" in the job picker.
import { useNavigate } from '@tanstack/react-router';
import { messageOf } from '../../data/errors';
import { useSaveLayout } from '../../data/mutations';
import { useMyOrgs, useProfile, useUserLayout } from '../../data/queries';
import { pushRecent, type Tool } from '../../lib/layout';
import { Button } from '../../ui/Button';
import { ErrorState, LoadingState } from '../../ui/States';
import { useToast } from '../../ui/Toast';
import { CompanyStep } from './CompanyStep';
import { NewJobForm } from './NewJobForm';

interface SetupFlowProps {
  onCancel?: (() => void) | undefined;
  /** Prefills the new job's stage (e.g. "prospect" from the bids pipeline). */
  stage?: string | undefined;
  /** The tool the new job opens in; my main default when not given. */
  openTool?: Tool | undefined;
}

export function SetupFlow({ onCancel, stage, openTool }: SetupFlowProps) {
  const orgs = useMyOrgs();
  const profile = useProfile();
  const layout = useUserLayout();
  const saveLayout = useSaveLayout();
  const navigate = useNavigate();
  const toast = useToast();

  if (orgs.isPending || profile.isPending || layout.isPending) return <LoadingState label="Opening" />;
  if (orgs.isError) return <ErrorState error={orgs.error} onRetry={() => void orgs.refetch()} />;
  if (profile.isError) return <ErrorState error={profile.error} onRetry={() => void profile.refetch()} />;
  if (layout.isError) return <ErrorState error={layout.error} onRetry={() => void layout.refetch()} />;

  const choices = layout.data.choices;

  function openJob(projectId: string) {
    saveLayout.mutate(
      { recent_project_ids: pushRecent(choices.recent_project_ids, projectId) },
      {
        onError: (e) => {
          toast.show({ tone: 'error', message: `Your recent jobs were not saved: ${messageOf(e)}` });
        },
      },
    );
    void navigate({ to: '/p/$projectId/$tool', params: { projectId, tool: openTool ?? choices.main_default } });
  }

  return (
    <div className="mx-auto flex w-full max-w-xl flex-col gap-3 p-4 sm:p-6">
      {orgs.data.length === 0 ? (
        <CompanyStep initialName={profile.data.company ?? ''} />
      ) : (
        <NewJobForm orgs={orgs.data} zone={profile.data.timezone} initialStage={stage} onCreated={openJob} onCancel={onCancel} />
      )}
      {orgs.data.length > 0 ? null : onCancel ? (
        <Button variant="quiet" className="self-center" onClick={onCancel}>
          Cancel
        </Button>
      ) : (
        <p className="text-center text-sm text-ink-2">Invited to a job? Open the link in your invite email.</p>
      )}
    </div>
  );
}
