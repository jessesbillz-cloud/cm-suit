// Sign in with an email code (SPEC §10.3). Email, "Send code", then the code. No passwords.
import { useState } from 'react';
import { z } from 'zod';
import { sendCode } from '../../data/auth';
import { messageOf } from '../../data/errors';
import { Button } from '../../ui/Button';
import { CodeForm } from './CodeForm';
import { PublicPage } from './PublicPage';

const emailSchema = z.string().trim().toLowerCase().email('Enter a valid email address.');

interface SignInProps {
  /** Runs after the code is accepted (the session listener does the rest). */
  onSignedIn?: (() => void) | undefined;
}

export function SignIn({ onSignedIn }: SignInProps) {
  const [email, setEmail] = useState('');
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  function validEmail(): string | null {
    const parsed = emailSchema.safeParse(email);
    if (!parsed.success) {
      setProblem(parsed.error.issues[0]?.message ?? 'Enter a valid email address.');
      return null;
    }
    return parsed.data;
  }

  /** A code that already arrived (e.g. after a rate-limited resend) can be entered without sending another. */
  function enterExistingCode() {
    const addr = validEmail();
    if (addr) setSentTo(addr);
  }

  function submit() {
    const addr = validEmail();
    if (!addr) return;
    const parsed = { data: addr };
    setBusy(true);
    setProblem(null);
    sendCode(parsed.data)
      .then(() => {
        setSentTo(parsed.data);
      })
      .catch((e: unknown) => {
        setProblem(messageOf(e));
      })
      .finally(() => {
        setBusy(false);
      });
  }

  if (sentTo !== null) {
    return (
      <PublicPage title="Enter your code">
        <CodeForm
          email={sentTo}
          emailLabel={sentTo}
          onVerified={() => {
            onSignedIn?.();
            return Promise.resolve();
          }}
          onBack={() => {
            setSentTo(null);
          }}
        />
      </PublicPage>
    );
  }

  return (
    <PublicPage title="Sign in">
      <form
        className="flex flex-col gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <label className="flex flex-col gap-1 text-sm font-medium text-ink" htmlFor="signin-email">
          Email
        </label>
        <input
          id="signin-email"
          type="email"
          autoComplete="off"
          autoFocus
          className="h-11 rounded-md border border-line px-3 text-base text-ink outline-none focus:border-accent"
          value={email}
          onChange={(e) => {
            setEmail(e.target.value);
          }}
        />
        {problem ? (
          <p role="alert" className="text-sm text-danger">
            {problem}
          </p>
        ) : null}
        <Button type="submit" variant="primary" loading={busy}>
          Send code
        </Button>
        <p className="text-xs text-ink-2">We email you a code. There is no password.</p>
        <button type="button" className="self-start text-sm text-accent hover:underline" onClick={enterExistingCode}>
          I already have a code
        </button>
      </form>
    </PublicPage>
  );
}
