// Signing a legal record (SPEC §6.9): addenda, daily reports, IRs, RFIs. The server signs only after a fresh sign-in;
// when it answers 403 reauth_required, the email code runs here inline and the signing is retried once.
// The ONE signing button: every signed record uses it.
import { useState } from 'react';
import { Stamp, type LucideIcon } from 'lucide-react';
import { sendCode, useUser } from '../../data/auth';
import { messageOf } from '../../data/errors';
import { FunctionError } from '../../data/functions';
import { Button } from '../../ui/Button';
import { CodeForm } from './CodeForm';

function needsReauth(e: unknown): boolean {
  return e instanceof FunctionError && e.status === 403 && e.error === 'reauth_required';
}

interface SignButtonProps {
  label: string;
  testId: string;
  /** The signing call (an edge function); rejects with the server's error. */
  sign: () => Promise<unknown>;
  onSigned: () => void;
  pending: boolean;
  disabled?: boolean | undefined;
  icon?: LucideIcon | undefined;
  /** sm 32px (a step inside a card), md 40px, lg 44px (a bar's one big action). */
  size?: 'sm' | 'md' | 'lg' | undefined;
}

export function SignButton({ label, testId, sign, onSigned, pending, disabled = false, icon = Stamp, size = 'md' }: SignButtonProps) {
  const user = useUser();
  const [reauth, setReauth] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  function run(afterReauth: boolean) {
    setProblem(null);
    sign().then(onSigned, (e: unknown) => {
      if (!afterReauth && needsReauth(e)) {
        sendCode(user.email).then(
          () => {
            setReauth(true);
          },
          (err: unknown) => {
            setProblem(messageOf(err));
          },
        );
        return;
      }
      setProblem(messageOf(e));
    });
  }

  if (reauth) {
    return (
      <CodeForm
        email={user.email}
        emailLabel={user.email}
        onVerified={() => {
          setReauth(false);
          run(true);
          return Promise.resolve();
        }}
      />
    );
  }
  return (
    <div className="flex flex-col gap-2">
      <Button
        variant="primary"
        size={size}
        icon={icon}
        loading={pending}
        disabled={disabled}
        data-testid={testId}
        onClick={() => {
          run(false);
        }}
      >
        {label}
      </Button>
      {problem ? <p className="text-sm text-danger">{problem}</p> : null}
    </div>
  );
}
