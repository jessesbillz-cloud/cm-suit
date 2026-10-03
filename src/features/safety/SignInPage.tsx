// /m/<meeting>?t=<token>: the meeting's sign-in page, the QR's target (SPEC §6.4 #8). No login (Jesse, Oct 3: "a
// public page they reach with the QR code, sign your name, and that's it; then they go away"): the meeting and the job
// at the top, then name, company, trade and the signature pad, Sign, and "Signed". Next person clears the form for a
// phone passed around the crew. Nothing is remembered on the phone.
import { useState } from 'react';
import { getRouteApi } from '@tanstack/react-router';
import { CircleCheck, PenLine, UserPlus } from 'lucide-react';
import { DataError, messageOf } from '../../data/errors';
import { FunctionError } from '../../data/functions';
import { useOpenMeeting, useSignMeeting } from '../../data/meetingSignin';
import type { MeetingKey, PublicMeeting, Signature } from '../../data/safety.types';
import { formatDay } from '../../lib/dates';
import { meetingLabel } from '../../lib/safety';
import { Button } from '../../ui/Button';
import { Card } from '../../ui/Card';
import { TextField } from '../../ui/Fields';
import { Icon } from '../../ui/Icon';
import { ErrorState, LoadingState } from '../../ui/States';
import { PublicPage } from '../auth/PublicPage';
import { PublicRequestShell } from '../inspections/PublicRequestShell';
import { isSignature } from './signature';
import { SignaturePad } from './SignaturePad';

const route = getRouteApi('/m/$meetingId');

function Done({ name, onNext }: { name: string; onNext: () => void }) {
  return (
    <Card>
      <div className="flex flex-col items-center gap-3 py-6 text-center" data-testid="signin-done">
        <span className="flex h-16 w-16 items-center justify-center rounded-full bg-[var(--status-confirmed-bg)] text-[var(--status-confirmed-dot)]">
          <Icon icon={CircleCheck} size={36} />
        </span>
        <h2 className="text-2xl font-semibold text-ink">Signed</h2>
        <p className="break-words text-base text-ink-2">{name}</p>
        <Button size="lg" icon={UserPlus} className="mt-2" data-testid="signin-next" onClick={onNext}>
          Next person
        </Button>
      </div>
    </Card>
  );
}

function SignInForm({ meetingKey }: { meetingKey: MeetingKey }) {
  const sign = useSignMeeting(meetingKey);
  const [name, setName] = useState('');
  const [company, setCompany] = useState('');
  const [trade, setTrade] = useState('');
  const [strokes, setStrokes] = useState<Signature>([]);
  const [done, setDone] = useState<string | null>(null);
  const ready = name.trim() !== '' && company.trim() !== '' && isSignature(strokes);

  if (done !== null) {
    return (
      <Done
        name={done}
        onNext={() => {
          sign.reset();
          setName('');
          setCompany('');
          setTrade('');
          setStrokes([]);
          setDone(null);
        }}
      />
    );
  }
  return (
    <Card>
      <form
        className="flex flex-col gap-4"
        data-testid="signin-form"
        onSubmit={(e) => {
          e.preventDefault();
          if (!ready) return;
          sign.mutate({ name, company, trade, signature: strokes }, { onSuccess: () => { setDone(name.trim()); } });
        }}
      >
        <TextField label="Name" value={name} onChange={setName} maxLength={120} autoComplete="name" large testId="signin-name" />
        <TextField label="Company" value={company} onChange={setCompany} maxLength={120} autoComplete="organization" large testId="signin-company" />
        <TextField label="Trade" value={trade} onChange={setTrade} maxLength={80} large testId="signin-trade" />
        <SignaturePad value={strokes} onChange={setStrokes} testId="signin-pad" />
        {sign.isError ? (
          <p role="alert" className="text-sm text-danger">
            {messageOf(sign.error)}
          </p>
        ) : null}
        <Button type="submit" variant="primary" size="lg" icon={PenLine} loading={sign.isPending} disabled={!ready} className="w-full" data-testid="signin-submit">
          Sign
        </Button>
      </form>
    </Card>
  );
}

function meta(m: PublicMeeting): string {
  return [m.project_name, meetingLabel(m.kind, m.number), formatDay(m.held_on, 'EEE, MMM d')].join(' · ');
}

export function SignInPage() {
  const { meetingId } = route.useParams();
  const { t } = route.useSearch();
  const key: MeetingKey | null = t ? { meetingId, token: t } : null;
  const open = useOpenMeeting(key);

  if (!key) {
    return (
      <PublicPage title="Link incomplete">
        <p className="text-sm text-ink-2">Scan the code again.</p>
      </PublicPage>
    );
  }
  if (open.isPending) {
    return (
      <PublicPage title="Opening the sign-in">
        <LoadingState label="Checking the link" />
      </PublicPage>
    );
  }
  if (open.isError) {
    const ended =
      (open.error instanceof FunctionError && open.error.status === 404) || (open.error instanceof DataError && open.error.code === 'P0002');
    return (
      <PublicPage title={ended ? 'Sign-in ended' : 'Sign-in not available'}>
        {ended ? (
          <p className="text-sm text-ink-2" data-testid="signin-ended">
            Ask the person running the meeting.
          </p>
        ) : (
          <ErrorState error={open.error} onRetry={() => void open.refetch()} className="m-0" />
        )}
      </PublicPage>
    );
  }
  if (!open.data.open) {
    return (
      <PublicPage title="Sign-in ended" meta={open.data.title}>
        <p className="text-sm text-ink-2" data-testid="signin-ended">
          Ask the person running the meeting.
        </p>
      </PublicPage>
    );
  }
  return (
    <PublicRequestShell title={open.data.title} meta={meta(open.data)}>
      <SignInForm meetingKey={key} />
    </PublicRequestShell>
  );
}
