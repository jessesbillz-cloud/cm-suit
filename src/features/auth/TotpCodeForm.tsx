// The six-digit box for an authenticator code, shared by enrollment (Settings) and the step-up prompt. One
// implementation: a verified code lifts the session to aal2 and refetches what depends on it (data/mfa).
import { useState } from 'react';
import { messageOf } from '../../data/errors';
import { useVerifyTotp } from '../../data/mfa';
import { normalizeTotpCode } from '../../lib/twoStep';
import { Button } from '../../ui/Button';

interface TotpCodeFormProps {
  factorId: string;
  /** One short line above the box. */
  prompt: string;
  onVerified: () => void;
}

export function TotpCodeForm({ factorId, prompt, onVerified }: TotpCodeFormProps) {
  const verify = useVerifyTotp();
  const [code, setCode] = useState('');
  const [problem, setProblem] = useState<string | null>(null);

  function submit() {
    const digits = normalizeTotpCode(code);
    if (digits === null) {
      setProblem('Enter the 6-digit code.');
      return;
    }
    setProblem(null);
    verify.mutate(
      { factorId, code: digits },
      {
        onSuccess: onVerified,
        onError: (e) => {
          setProblem(messageOf(e));
        },
      },
    );
  }

  return (
    <form
      className="flex flex-col gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <p className="text-sm text-ink-2">{prompt}</p>
      <div className="flex items-center gap-2">
        <input
          autoFocus
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="[0-9 -]*"
          aria-label="Code"
          data-testid="totp-code"
          className="h-9 w-32 rounded-md border border-line px-3 text-base tracking-[0.3em] text-ink outline-none focus:border-accent"
          value={code}
          onChange={(e) => {
            setCode(e.target.value);
          }}
        />
        <Button type="submit" variant="primary" loading={verify.isPending} data-testid="totp-verify">
          Verify
        </Button>
      </div>
      {problem ? (
        <p role="alert" className="text-sm text-danger">
          {problem}
        </p>
      ) : null}
    </form>
  );
}
