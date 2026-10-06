// The email code step (6-10 digits, whatever Auth is set to), shared by sign-in, access links and share links. No passwords anywhere.
import { useEffect, useState } from 'react';
import { sendCode, verifyCode } from '../../data/auth';
import { messageOf } from '../../data/errors';
import { Button } from '../../ui/Button';

/** After "Send a new code", how long until it can be sent again (sign-in sends one code a minute at most). */
const RESEND_WAIT_MS = 60_000;

/** The public pages' one input look: a 44px box with the accent focus ring. */
export const INPUT =
  'h-11 w-full rounded-md border border-line-strong bg-card px-3 text-base text-ink shadow-control outline-none transition-shadow focus:border-accent focus:ring-[3px] focus:ring-accent/20';

interface CodeFormProps {
  /** The address the code was sent to (full; used to verify). */
  email: string;
  /** What to show: the full address, or a masked one on public links. */
  emailLabel: string;
  onVerified: () => Promise<void>;
  onBack?: (() => void) | undefined;
}

export function CodeForm({ email, emailLabel, onVerified, onBack }: CodeFormProps) {
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [resent, setResent] = useState(false);
  // "Send a new code" comes back after a minute, so a second lost email never strands anyone on this screen.
  useEffect(() => {
    if (!resent) return undefined;
    const t = window.setTimeout(() => {
      setResent(false);
    }, RESEND_WAIT_MS);
    return () => {
      window.clearTimeout(t);
    };
  }, [resent]);

  function submit() {
    const digits = code.replace(/\D/g, '');
    if (digits.length < 6 || digits.length > 10) {
      setProblem('Enter the code from the email.');
      return;
    }
    setBusy(true);
    setProblem(null);
    verifyCode(email, digits)
      .then(onVerified)
      .catch((e: unknown) => {
        setProblem(messageOf(e));
      })
      .finally(() => {
        setBusy(false);
      });
  }

  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <p className="text-sm text-ink-2">
        We emailed a code to <span className="font-medium text-ink">{emailLabel}</span>.
      </p>
      <label className="flex flex-col gap-1.5 text-sm font-medium text-ink">
        Code
        <input
          autoFocus
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={10}
          className={`${INPUT} text-center text-lg font-medium tabular-nums tracking-[0.3em]`}
          value={code}
          onChange={(e) => {
            setCode(e.target.value);
          }}
        />
      </label>
      {problem ? (
        <p role="alert" className="text-sm text-danger">
          {problem}
        </p>
      ) : null}
      <Button type="submit" variant="primary" loading={busy} className="h-11">
        Sign in
      </Button>
      <div className="flex items-center justify-between border-t border-line pt-3 text-sm">
        {onBack ? (
          <button type="button" className="text-ink-2 hover:text-ink" onClick={onBack}>
            Use a different email
          </button>
        ) : (
          <span />
        )}
        <button
          type="button"
          className="text-accent hover:underline disabled:text-ink-3/50"
          disabled={resent}
          onClick={() => {
            setResent(true);
            sendCode(email).catch((e: unknown) => {
              setResent(false);
              setProblem(messageOf(e));
            });
          }}
        >
          {resent ? 'New code sent' : 'Send a new code'}
        </button>
      </div>
    </form>
  );
}
