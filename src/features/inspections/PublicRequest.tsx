// The default on the request link and QR sheet (/r/<job>?t=<token>, SPEC §6.4 #4; Jesse, Oct 2: login is not the
// barrier): a sub in the field requests an inspection with no account. The job's day as anyone may see it (time,
// length, type, color), the member form's fields, up to 3 photos or PDFs, and who is asking (remembered on this phone).
// The database numbers the request; the receipt carries the private status link. A request, not a booking.
import { useState } from 'react';
import { Send } from 'lucide-react';
import { messageOf } from '../../data/errors';
import type { IrKind } from '../../data/inspections.types';
import type { LinkKey } from '../../data/requestLink.types';
import { usePublicDay, useSubmitPublicRequest } from '../../data/requestNoLogin';
import type { Contact, PublicDay, Submitted } from '../../data/requestNoLogin.types';
import { contactReady, rememberContact, rememberedContact } from '../../lib/requestContact';
import { Button } from '../../ui/Button';
import { Card } from '../../ui/Card';
import { FIELD_AREA_LARGE, FIELD_LABEL, SelectField } from '../../ui/Fields';
import { ErrorState, LoadingState } from '../../ui/States';
import { ChoiceRow } from './ChoiceRow';
import { ContactFields } from './ContactFields';
import { DayList } from './DayList';
import { PublicFiles } from './PublicFiles';
import { PublicReceipt } from './PublicReceipt';
import { PublicRequestShell } from './PublicRequestShell';
import { DEFAULT_DURATION, FLEXIBLE, isDay, whenOf, type WhenPick } from './time';
import { WhenFields } from './WhenFields';

interface PublicRequestProps {
  linkKey: LinkKey;
  projectName: string;
  /** "Sign in to see all your requests": the email-code join (a Requester). */
  onSignIn: () => void;
}

interface FormProps {
  linkKey: LinkKey;
  first: PublicDay;
  onSent: (r: Submitted) => void;
  onSignIn: () => void;
}

function kindOptions(ofs: boolean): { value: IrKind; label: string }[] {
  return [{ value: 'ior', label: 'IOR' }, { value: 'special', label: 'Special' }, ...(ofs ? [{ value: 'ofs' as const, label: 'OFS' }] : [])];
}

function PublicRequestForm({ linkKey, first, onSent, onSignIn }: FormProps) {
  const today = first.today;
  const submit = useSubmitPublicRequest(linkKey);
  const [when, setWhen] = useState<WhenPick>({ date: today, time: FLEXIBLE, duration: DEFAULT_DURATION });
  const [kind, setKind] = useState<IrKind>('ior');
  const [special, setSpecial] = useState(first.kinds[0]?.id ?? '');
  const [items, setItems] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [contact, setContact] = useState<Contact>(rememberedContact);
  const [remembered, setRemembered] = useState(() => contactReady(contact));
  const [ack, setAck] = useState(false);
  // Today rides on the first answer; another day is asked for when picked.
  const valid = isDay(when.date) && when.date >= today;
  const day = usePublicDay(linkKey, valid && when.date !== today ? when.date : null);
  const whenValue = whenOf(when);
  const ready = valid && items.trim() !== '' && contactReady(contact) && ack && (kind !== 'special' || special !== '');

  return (
    <form
      className="flex flex-col gap-4"
      data-testid="public-request"
      onSubmit={(e) => {
        e.preventDefault();
        if (!ready) return;
        submit.mutate(
          { contact, ...whenValue, kind, specialKindId: kind === 'special' ? special : null, items, files },
          {
            onSuccess: (r) => {
              rememberContact(contact);
              onSent(r);
            },
          },
        );
      }}
    >
      <Card title="When">
        <div className="flex flex-col gap-3">
          <WhenFields value={when} onChange={setWhen} testId="public" large />
          {valid ? (
            <DayList
              when={whenValue}
              rows={day.data && !day.isPlaceholderData ? day.data.rows : undefined}
              error={day.isError ? day.error : null}
              onRetry={() => void day.refetch()}
              testId="public-day"
            />
          ) : (
            <p className="text-sm text-danger">Pick today or a later day.</p>
          )}
        </div>
      </Card>
      <Card title="What">
        <div className="flex flex-col gap-3">
          <ChoiceRow label="Type" options={kindOptions(first.ofs)} value={kind} onPick={setKind} testId="public-kind" large />
          {kind === 'special' ? (
            <SelectField
              label="Special inspection"
              value={special}
              options={first.kinds.map((k) => ({ value: k.id, label: k.name }))}
              onChange={setSpecial}
              testId="public-special"
              large
            />
          ) : null}
          <label className={FIELD_LABEL}>
            Items to inspect
            <textarea
              rows={4}
              maxLength={4000}
              className={FIELD_AREA_LARGE}
              value={items}
              data-testid="public-items"
              onChange={(e) => {
                setItems(e.target.value);
              }}
            />
          </label>
          <PublicFiles files={files} onChange={setFiles} />
        </div>
      </Card>
      <Card title="You">
        <ContactFields
          value={contact}
          onChange={setContact}
          remembered={remembered}
          onForget={() => {
            setRemembered(false);
          }}
        />
      </Card>
      <label className="flex cursor-pointer items-start gap-3 rounded-card bg-card px-4 py-3.5 text-[15px] leading-6 text-ink shadow-card">
        <input
          type="checkbox"
          className="mt-0.5 h-5 w-5 shrink-0 accent-accent"
          checked={ack}
          data-testid="public-ack"
          onChange={(e) => {
            setAck(e.target.checked);
          }}
        />
        <span>24 hours notice (48 for special). I&apos;ll be present, with safe access and plans on site.</span>
      </label>
      {submit.isError ? (
        <p role="alert" className="text-sm text-danger" data-testid="public-error">
          {messageOf(submit.error)}
        </p>
      ) : null}
      <div className="sticky bottom-0 z-10 -mx-4 flex items-center gap-3 border-t border-line bg-card px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] shadow-[0_-8px_16px_-12px_rgba(16,24,40,.25)] sm:bottom-3 sm:mx-0 sm:rounded-card sm:border sm:shadow-card">
        <span className="flex-1 text-sm text-ink-2">A request, not a booking.</span>
        <Button
          type="submit"
          variant="primary"
          size="lg"
          icon={Send}
          className="h-12 px-7"
          disabled={!ready}
          loading={submit.isPending}
          data-testid="public-submit"
        >
          Request
        </Button>
      </div>
      <button
        type="button"
        className="self-center py-2 text-sm font-medium text-accent hover:underline"
        data-testid="request-signin"
        onClick={onSignIn}
      >
        Sign in to see all your requests
      </button>
    </form>
  );
}

export function PublicRequest({ linkKey, projectName, onSignIn }: PublicRequestProps) {
  const first = usePublicDay(linkKey, null);
  const [sent, setSent] = useState<Submitted | null>(null);

  if (sent) {
    return (
      <PublicRequestShell title={projectName} meta="Inspection requested">
        <PublicReceipt
          projectId={linkKey.projectId}
          receipt={sent}
          onAnother={() => {
            setSent(null);
          }}
        />
      </PublicRequestShell>
    );
  }
  return (
    <PublicRequestShell title={projectName} meta="Request an inspection">
      {first.isPending ? <LoadingState label="Loading the form" /> : null}
      {first.isError ? <ErrorState error={first.error} title="The form did not load." className="m-0" onRetry={() => void first.refetch()} /> : null}
      {first.data ? <PublicRequestForm linkKey={linkKey} first={first.data} onSent={setSent} onSignIn={onSignIn} /> : null}
    </PublicRequestShell>
  );
}
