// Joining a job from its request link (SPEC §6.4 #4): name and company, then (signed out) the email code. The code
// is what proves the address; the request-link function then records a sub invite for it and accept_invites binds it.
import { useState } from 'react';
import { sendCode } from '../../data/auth';
import { messageOf } from '../../data/errors';
import { useJoinRequestLink } from '../../data/requestLink';
import type { LinkKey } from '../../data/requestLink.types';
import { Button } from '../../ui/Button';
import { CodeForm, INPUT } from '../auth/CodeForm';

interface FieldProps {
  id: string;
  label: string;
  type?: 'text' | 'email';
  autoComplete: string;
  value: string;
  onChange: (v: string) => void;
}

function Field({ id, label, type = 'text', autoComplete, value, onChange }: FieldProps) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-sm font-medium text-ink" htmlFor={id}>
        {label}
      </label>
      <input
        id={id}
        type={type}
        autoComplete={autoComplete}
        className={INPUT}
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
        }}
      />
    </div>
  );
}

interface JoinFormProps {
  linkKey: LinkKey;
  /** The signed-in address on this device, or null when signed out. */
  signedInAs: string | null;
}

export function JoinForm({ linkKey, signedInAs }: JoinFormProps) {
  const join = useJoinRequestLink(linkKey);
  const [name, setName] = useState('');
  const [company, setCompany] = useState('');
  const [email, setEmail] = useState('');
  const [step, setStep] = useState<'details' | 'code'>('details');
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  const joinNow = (): Promise<void> => join.mutateAsync({ name: name.trim(), company: company.trim() }).then(() => undefined);

  function submit() {
    if (!name.trim() || !company.trim() || (!signedInAs && !email.trim())) {
      setProblem('Fill in every box.');
      return;
    }
    setProblem(null);
    setBusy(true);
    const next = signedInAs ? joinNow() : sendCode(email).then(() => {
      setStep('code');
    });
    next
      .catch((e: unknown) => {
        setProblem(messageOf(e));
      })
      .finally(() => {
        setBusy(false);
      });
  }

  if (step === 'code') {
    return (
      <CodeForm
        email={email}
        emailLabel={email.trim()}
        onVerified={joinNow}
        onBack={() => {
          setStep('details');
        }}
      />
    );
  }

  return (
    <form
      className="flex flex-col gap-3"
      data-testid="request-join"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <Field id="join-name" label="Your name" autoComplete="name" value={name} onChange={setName} />
      <Field id="join-company" label="Company" autoComplete="organization" value={company} onChange={setCompany} />
      {signedInAs ? (
        <p className="text-sm text-ink-2">
          Signed in as <span className="font-medium text-ink">{signedInAs}</span>
        </p>
      ) : (
        <Field id="join-email" label="Email" type="email" autoComplete="email" value={email} onChange={setEmail} />
      )}
      {problem ? (
        <p role="alert" className="text-sm text-danger">
          {problem}
        </p>
      ) : null}
      <Button type="submit" variant="primary" loading={busy} className="h-11" data-testid="request-join-go">
        {signedInAs ? 'Join' : 'Send code'}
      </Button>
    </form>
  );
}
