// The default on the request link and QR sheet (/r/<job>?t=<token>, SPEC §6.4 #4; Jesse, Oct 2: login is not the
// barrier): a sub in the field requests an inspection with no account. The job's day as anyone may see it (time,
// length, type, color), the member form's fields, up to 3 photos or PDFs, and who is asking (remembered on this phone).
// The database numbers the request; the receipt carries the private status link. A request, not a booking. On an OFS
// job with revs, an OFS request picks walls and items with the members' Revs picker (0057), and its map is drawn right
// after sending, by the receipt.
import { useState } from 'react';
import { Send } from 'lucide-react';
import { messageOf } from '../../data/errors';
import type { IrKind } from '../../data/inspections.types';
import type { LinkKey } from '../../data/requestLink.types';
import { usePublicDay, useSubmitPublicOfs, useSubmitPublicRequest } from '../../data/requestNoLogin';
import type { Contact, PublicDay, PublicRevs, Submitted } from '../../data/requestNoLogin.types';
import { usePublicRevs } from '../../data/requestNoLoginRevs';
import { contactReady, rememberContact, rememberedContact } from '../../lib/requestContact';
import { Button } from '../../ui/Button';
import { Card } from '../../ui/Card';
import { FIELD_AREA_LARGE, FIELD_LABEL, SelectField } from '../../ui/Fields';
import { ErrorState, LoadingState } from '../../ui/States';
import { listsWithWalls, prefillPick, requestPlan, statusIndex, type RevPick } from '../revs/revPick';
import { ChoiceRow } from './ChoiceRow';
import { ContactFields } from './ContactFields';
import { DayList } from './DayList';
import { sheetToSend } from './mapSheets';
import { PublicFiles } from './PublicFiles';
import { PublicMap } from './PublicMap';
import { PublicOfsFields } from './PublicOfsFields';
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

/** Sent: the receipt, and whether it has a map to draw (sent with walls). */
interface Sent {
  receipt: Submitted;
  map: boolean;
}

interface FormProps {
  linkKey: LinkKey;
  first: PublicDay;
  /** The job's walls, when it has any to pick (an OFS job with revs). */
  revs: PublicRevs | null;
  onSent: (sent: Sent) => void;
  onSignIn: () => void;
}

function kindOptions(ofs: boolean): { value: IrKind; label: string }[] {
  return [{ value: 'ior', label: 'IOR' }, { value: 'special', label: 'Special' }, ...(ofs ? [{ value: 'ofs' as const, label: 'OFS' }] : [])];
}

function PublicRequestForm({ linkKey, first, revs, onSent, onSignIn }: FormProps) {
  const today = first.today;
  const submit = useSubmitPublicRequest(linkKey);
  const submitOfs = useSubmitPublicOfs(linkKey);
  const [when, setWhen] = useState<WhenPick>({ date: today, time: FLEXIBLE, duration: DEFAULT_DURATION });
  // A job with walls to pick takes OFS requests first.
  const [kind, setKind] = useState<IrKind>(revs !== null ? 'ofs' : 'ior');
  const [special, setSpecial] = useState(first.kinds[0]?.id ?? '');
  const [items, setItems] = useState('');
  const [pick, setPick] = useState<RevPick>(() =>
    revs !== null ? prefillPick(revs.setup, statusIndex(revs.status)) : { listId: null, areaIds: [], itemIds: [] },
  );
  const [sheet, setSheet] = useState<string | null>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [contact, setContact] = useState<Contact>(rememberedContact);
  const [remembered, setRemembered] = useState(() => contactReady(contact));
  const [ack, setAck] = useState(false);
  // Today rides on the first answer; another day is asked for when picked.
  const valid = isDay(when.date) && when.date >= today;
  const day = usePublicDay(linkKey, valid && when.date !== today ? when.date : null);
  const whenValue = whenOf(when);
  const plan = kind === 'ofs' && revs !== null ? requestPlan(revs.setup, statusIndex(revs.status), pick) : null;
  const sending = plan !== null ? submitOfs : submit;
  const what = plan !== null ? plan.items.length > 0 && plan.walls.length > 0 : items.trim() !== '';
  const ready = valid && what && contactReady(contact) && ack && (kind !== 'special' || special !== '');

  return (
    <form
      className="flex flex-col gap-4"
      data-testid="public-request"
      onSubmit={(e) => {
        e.preventDefault();
        if (!ready) return;
        const sent = (map: boolean) => (receipt: Submitted) => {
          rememberContact(contact);
          onSent({ receipt, map });
        };
        if (plan !== null) {
          const areaIds = plan.walls.map((a) => a.id);
          const itemIds = plan.items.map((r) => r.item.id);
          const sheetFileId = sheetToSend(plan.walls, sheet);
          submitOfs.mutate({ contact, ...whenValue, areaIds, itemIds, sheetFileId, files }, { onSuccess: sent(true) });
          return;
        }
        const specialKindId = kind === 'special' ? special : null;
        submit.mutate({ contact, ...whenValue, kind, specialKindId, items, files }, { onSuccess: sent(false) });
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
          {plan !== null && revs !== null ? (
            <PublicOfsFields revs={revs} pick={pick} onPick={setPick} sheet={sheet} onSheet={setSheet} date={when.date} />
          ) : (
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
          )}
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
      {sending.isError ? (
        <p role="alert" className="text-sm text-danger" data-testid="public-error">
          {messageOf(sending.error)}
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
          loading={sending.isPending}
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

type BodyProps = Omit<FormProps, 'revs'>;

/** An OFS job: its walls load with the form; walls to pick replace typing the items. */
function OfsJobForm(props: BodyProps) {
  const revs = usePublicRevs(props.linkKey);
  // A failed refetch keeps the form and what is typed in it.
  if (revs.data === undefined) {
    if (revs.isError) {
      return <ErrorState error={revs.error} title="The form did not load." className="m-0" onRetry={() => void revs.refetch()} />;
    }
    return <LoadingState label="Loading the form" />;
  }
  return <PublicRequestForm {...props} revs={listsWithWalls(revs.data.setup).length > 0 ? revs.data : null} />;
}

export function PublicRequest({ linkKey, projectName, onSignIn }: PublicRequestProps) {
  const first = usePublicDay(linkKey, null);
  const [sent, setSent] = useState<Sent | null>(null);

  if (sent) {
    return (
      <PublicRequestShell title={projectName} meta="Inspection requested">
        <PublicReceipt
          projectId={linkKey.projectId}
          receipt={sent.receipt}
          onAnother={() => {
            setSent(null);
          }}
        >
          {sent.map ? <PublicMap projectId={linkKey.projectId} receipt={sent.receipt.receipt} editing /> : null}
        </PublicReceipt>
      </PublicRequestShell>
    );
  }
  const body = first.data ? { linkKey, first: first.data, onSent: setSent, onSignIn } : null;
  return (
    <PublicRequestShell title={projectName} meta="Request an inspection">
      {first.isPending ? <LoadingState label="Loading the form" /> : null}
      {first.isError ? <ErrorState error={first.error} title="The form did not load." className="m-0" onRetry={() => void first.refetch()} /> : null}
      {body === null ? null : body.first.ofs ? <OfsJobForm {...body} /> : <PublicRequestForm {...body} revs={null} />}
    </PublicRequestShell>
  );
}
