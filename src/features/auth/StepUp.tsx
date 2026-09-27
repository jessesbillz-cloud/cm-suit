// The inline step-up prompt: where money would show but the session is still aal1. With two-step login on, the
// code box lifts the session in place; without it, one button goes to Settings (router, never window events).
import { useNavigate, useParams } from '@tanstack/react-router';
import { Settings } from 'lucide-react';
import { useMfaStatus } from '../../data/mfa';
import { Button } from '../../ui/Button';
import { ErrorState, LoadingState } from '../../ui/States';
import { TotpCodeForm } from './TotpCodeForm';

export function StepUp({ onDone }: { onDone?: (() => void) | undefined }) {
  const status = useMfaStatus();
  const navigate = useNavigate();
  const { projectId } = useParams({ strict: false });

  if (status.isPending) return <LoadingState label="Checking two-step login" />;
  if (status.isError) return <ErrorState error={status.error} onRetry={() => void status.refetch()} />;

  const factorId = status.data.factorId;
  if (factorId === null) {
    return (
      <div className="flex flex-wrap items-center gap-3" data-testid="step-up-off">
        <p className="text-sm text-ink-2">Turn on two-step login to see prices</p>
        <Button
          size="sm"
          icon={Settings}
          onClick={() => {
            if (projectId) void navigate({ to: '/p/$projectId/$tool', params: { projectId, tool: 'settings' } });
            else void navigate({ to: '/' });
          }}
        >
          Settings
        </Button>
      </div>
    );
  }
  return (
    <div data-testid="step-up">
      <TotpCodeForm factorId={factorId} prompt="Enter the code from your authenticator app" onVerified={() => onDone?.()} />
    </div>
  );
}
