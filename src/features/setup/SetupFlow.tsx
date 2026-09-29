// Starting out (SPEC §5.1): no company yet -> "Set up your company"; then "Add a job", which opens the new job in my
// default tool. The same flow serves the first run (no jobs) and "New job" in the job picker.
import { useNavigate } from '@tanstack/react-router';
import { messageOf } from '../../data/errors';
import { useSaveLayout } from '../../data/mutations';
import { useMyOrgs, useProfile, useUserLayout } from '../../data/queries';
import { pushRecent, type Tool } from '../../lib/layout';
import { Button } from '../../ui/Button';
import { Card } from '../../ui/Card';
import { ErrorState, LoadingState } from '../../ui/States';
import { useToast } from '../../ui/Toast';
import { PublicShell } from '../auth/PublicPage';
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

  if (!orgs.isSuccess || !profile.isSuccess || !layout.isSuccess) {
    const pending = orgs.isPending || profile.isPending || layout.isPending;
    const failed = orgs.isError ? orgs : profile.isError ? profile : layout.isError ? layout : null;
    return (
      <PublicShell wide>
        <Card padded={false}>
          {!pending && failed !== null ? <ErrorState error={failed.error} onRetry={() => void failed.refetch()} /> : <LoadingState label="Opening" />}
        </Card>
      </PublicShell>
    );
  }

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
    <PublicShell wide>
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
    </PublicShell>
  );
}
