// Settings > Two-step login: off -> Turn on (QR, key, code) -> On -> Turn off. Turning off needs an aal2 session,
// so a session that only signed in with the email code enters a code first.
import { useState, type ReactNode } from 'react';
import { messageOf } from '../../data/errors';
import { useEnrollTotp, useMfaStatus, useUnenrollTotp, type Enrollment } from '../../data/mfa';
import { groupKey, qrImageSrc } from '../../lib/twoStep';
import { Button } from '../../ui/Button';
import { Card } from '../../ui/Card';
import { ErrorState, LoadingState } from '../../ui/States';
import { useToast } from '../../ui/Toast';
import { TotpCodeForm } from '../auth/TotpCodeForm';

const TITLE = 'Two-step login';

function EnrollPanel({ enrollment, onVerified, onCancel }: { enrollment: Enrollment; onVerified: () => void; onCancel: () => void }) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
      <img
        src={qrImageSrc(enrollment.qrCode)}
        alt="QR code for your authenticator app"
        width={160}
        height={160}
        className="h-40 w-40 shrink-0 rounded-md border border-line bg-card"
        data-testid="two-step-qr"
      />
      <div className="flex min-w-0 flex-1 flex-col gap-3">
        <TotpCodeForm factorId={enrollment.factorId} prompt="Scan with your authenticator app, then enter its code." onVerified={onVerified} />
        <p className="break-all font-mono text-xs text-ink-2" data-testid="two-step-key">
          Key: {groupKey(enrollment.secret)}
        </p>
        <Button variant="quiet" size="sm" className="self-start" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </div>
  );
}

function StatusLine({ on, action }: { on: boolean; action: ReactNode }) {
  return (
    <div className="flex items-center gap-3">
      <p className="flex-1 text-sm text-ink" data-testid="two-step-status">
        {on ? 'On' : 'Off'}
      </p>
      {action}
    </div>
  );
}

export function TwoStepCard() {
  const status = useMfaStatus();
  const enroll = useEnrollTotp();
  const unenroll = useUnenrollTotp();
  const toast = useToast();
  const [stepUp, setStepUp] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  if (status.isPending) {
    return (
      <Card title={TITLE}>
        <LoadingState label="Checking two-step login" />
      </Card>
    );
  }
  if (status.isError) {
    return (
      <Card title={TITLE}>
        <ErrorState error={status.error} onRetry={() => void status.refetch()} />
      </Card>
    );
  }

  const { factorId, level } = status.data;

  function turnOff(id: string) {
    setProblem(null);
    unenroll.mutate(id, {
      onSuccess: () => {
        toast.show({ message: 'Two-step login is off.' });
      },
      onError: (e) => {
        setProblem(messageOf(e));
      },
    });
  }

  let body: ReactNode;
  if (factorId !== null && stepUp) {
    body = (
      <TotpCodeForm
        factorId={factorId}
        prompt="Enter the code from your authenticator app to turn it off."
        onVerified={() => {
          setStepUp(false);
          turnOff(factorId);
        }}
      />
    );
  } else if (factorId !== null) {
    body = (
      <StatusLine
        on
        action={
          <Button
            loading={unenroll.isPending}
            data-testid="two-step-off"
            onClick={() => {
              if (level === 'aal2') turnOff(factorId);
              else setStepUp(true);
            }}
          >
            Turn off
          </Button>
        }
      />
    );
  } else if (enroll.data) {
    body = (
      <EnrollPanel
        enrollment={enroll.data}
        onVerified={() => {
          enroll.reset();
          toast.show({ message: 'Two-step login is on.' });
        }}
        onCancel={() => {
          enroll.reset();
        }}
      />
    );
  } else {
    body = (
      <StatusLine
        on={false}
        action={
          <Button
            variant="primary"
            loading={enroll.isPending}
            data-testid="two-step-on"
            onClick={() => {
              setProblem(null);
              enroll.mutate(undefined, {
                onError: (e) => {
                  setProblem(messageOf(e));
                },
              });
            }}
          >
            Turn on
          </Button>
        }
      />
    );
  }

  return (
    <Card title={TITLE}>
      {body}
      {problem ? (
        <p role="alert" className="mt-2 text-sm text-danger">
          {problem}
        </p>
      ) : null}
    </Card>
  );
}
