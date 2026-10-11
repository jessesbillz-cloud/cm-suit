// A new inspection request (SPEC §13.2). Prefilled: job, GC, inspector, my company, the day being looked at. The IR
// number comes from the database on submit. Before sending, that day's bookings show (anonymized). A request, not a
// booking: nothing is refused for notice or overlaps. On an OFS job with revs, an OFS request picks walls and items
// instead of typing them (prefilled from the Revs link: ?areas=&items=), and its map is drawn right after sending.
// Every OFS request answers one question (special inspection required?); the inspector filing one himself states,
// once, that the earlier inspections are complete (SPEC §18.4 P1: no box per item). Anyone else confirms the job's
// attestation wording in one small dialog before an OFS request goes (0091), and that same I confirm states the notice
// (Jesse, Oct 10: one statement, not two). Fewer taps (MDR): an OFS request starts on the next working day, the time and
// length last used here are remembered on the device, and the receipt files another like this in one tap.
import { useState } from 'react';
import { useSearch } from '@tanstack/react-router';
import { messageOf } from '../../data/errors';
import { useSubmitIr, type IrUpload } from '../../data/inspections.mutations';
import { useOfsAttestText } from '../../data/inspections.ofs';
import { useIrFormContext } from '../../data/inspections.queries';
import type { FormContext, IrKind, IrRowRaw } from '../../data/inspections.types';
import { useSubmitOfs } from '../../data/revs.mutations';
import { useRevSetup, useRevStatus } from '../../data/revs.queries';
import { todayInZone } from '../../lib/dates';
import { ErrorState, LoadingState } from '../../ui/States';
import { listsWithWalls, prefillPick, requestPlan, statusIndex, type RevPick } from '../revs/revPick';
import { AttachmentsField } from './AttachmentsField';
import { AttestDialog } from './AttestDialog';
import { ChoiceRow } from './ChoiceRow';
import { ConflictPreview } from './ConflictPreview';
import { IrMap } from './IrMap';
import { NOTICE_STATEMENT } from './model';
import { InspectorStatement, NoticeBox, SpecialQuestion } from './OfsAsk';
import { OfsFields, type OfsRevs } from './OfsFields';
import { Receipt } from './Receipt';
import { CompanyField, ItemsText, SubmitBar } from './RequestParts';
import { SpecialPick } from './SpecialPick';
import { useOpenRequest, useSelectedDay } from './useInspectionsNav';
import { againWhen, dayFor, recallWhen, rememberWhen, startWhen } from './requestStart';
import { useIrAccess, type IrJob } from './useIrAccess';
import { isDay, whenOf, type WhenPick } from './time';
import { WhenFields } from './WhenFields';

interface BodyProps {
  projectId: string;
  job: IrJob;
  ctx: FormContext;
  day: string;
  /** I decide inspections here (ir.decide): my own OFS request goes straight to OFS, on one statement. */
  inspector: boolean;
  /** The job's revs, when it has walls to pick (an OFS job). */
  revs: OfsRevs | null;
}

interface Sent {
  row: IrRowRaw;
  /** Sent with walls: it has a map to draw. */
  map: boolean;
  /** The day, time and length it went with (File another like this). */
  when: WhenPick;
}

/** The link from Revs: the walls and items to start from. */
interface PrefillSearch {
  areas?: string | undefined;
  items?: string | undefined;
}

function kindOptions(ofs: boolean): { value: IrKind; label: string }[] {
  return [{ value: 'ior', label: 'IOR' }, { value: 'special', label: 'Special' }, ...(ofs ? [{ value: 'ofs' as const, label: 'OFS' }] : [])];
}

function RequestFormBody({ projectId, job, ctx, day, inspector, revs }: BodyProps) {
  const submit = useSubmitIr();
  const submitOfs = useSubmitOfs();
  const track = useOpenRequest(projectId);
  const linked = revs !== null && (revs.start.areaIds.length > 0 || revs.start.itemIds.length > 0);
  const [kind, setKind] = useState<IrKind>(linked ? 'ofs' : 'ior');
  const [when, setWhen] = useState<WhenPick>(() => startWhen(kind, day, ctx.today, recallWhen(projectId)));
  // A day picked by hand stays when the type changes; else the day follows the type.
  const [dayPicked, setDayPicked] = useState(false);
  const [company, setCompany] = useState(ctx.my_company ?? ctx.companies[0] ?? '');
  const [special, setSpecial] = useState('');
  const [items, setItems] = useState('');
  const [pick, setPick] = useState<RevPick>(revs?.start ?? { listId: null, areaIds: [], itemIds: [] });
  const [sheet, setSheet] = useState<string | null>(null);
  const [files, setFiles] = useState<IrUpload[]>([]);
  const [uploading, setUploading] = useState(false);
  const [ack, setAck] = useState(false);
  // An OFS request's own: the special inspection question (null until answered) and the inspector's statement.
  const [specialRequired, setSpecialRequired] = useState<boolean | null>(null);
  const [stated, setStated] = useState(false);
  const [sent, setSent] = useState<Sent | null>(null);
  // The sub's attestation (0091): the dialog is open, the request goes on I confirm.
  const [attesting, setAttesting] = useState(false);
  // The sub's I confirm also states the notice: no box for it.
  const attests = kind === 'ofs' && !inspector;
  const wording = useOfsAttestText(projectId, attests);
  const plan = kind === 'ofs' && revs !== null ? requestPlan(revs.setup, statusIndex(revs.status), pick) : null;
  const sending = plan !== null ? submitOfs : submit;

  if (sent) {
    return (
      <Receipt
        row={sent.row}
        specialName={ctx.kinds.find((k) => k.id === sent.row.special_kind_id)?.name ?? null}
        onTrack={() => {
          track(sent.row.id);
        }}
        onAnother={() => {
          setSent(null);
          setItems('');
          setPick({ listId: pick.listId, areaIds: [], itemIds: [] });
          setSheet(null);
          setFiles([]);
          setAck(false);
          setSpecialRequired(null);
          setStated(false);
          setAttesting(false);
        }}
        onAgain={() => {
          // The same walls, items, time and answers, the next working day; the statements are made again.
          setWhen(againWhen(sent.when));
          setDayPicked(true);
          setSent(null);
          setFiles([]);
          setAck(false);
          setStated(false);
          setAttesting(false);
        }}
      >
        {sent.map ? <IrMap requestId={sent.row.id} projectId={projectId} editing /> : null}
      </Receipt>
    );
  }

  const what = plan !== null ? plan.items.length > 0 && plan.walls.length > 0 : items.trim() !== '';
  const ofsReady = kind !== 'ofs' || (specialRequired !== null && (!inspector || stated));
  const ready = isDay(when.date) && company.trim() !== '' && what && (attests || ack) && ofsReady && !uploading && (kind !== 'special' || special !== '');
  const whenValue = whenOf(when);
  const back = {
    onError: () => {
      setAttesting(false);
    },
  };

  function send() {
    const common = { projectId, company: company.trim(), attachmentIds: files.map((f) => f.id), noticeAck: attests || ack, ...whenValue };
    const done = (row: IrRowRaw, map: boolean) => {
      rememberWhen(projectId, when);
      setSent({ row, map, when });
    };
    const inspectorAck = kind === 'ofs' && inspector && stated;
    if (plan !== null) {
      if (specialRequired === null) return;
      const areaIds = plan.walls.map((a) => a.id);
      const itemIds = plan.items.map((r) => r.item.id);
      submitOfs.mutate(
        { ...common, areaIds, itemIds, sheetFileId: sheet, specialRequired, inspectorAck },
        {
          ...back,
          onSuccess: (row) => {
            done(row, true);
          },
        },
      );
      return;
    }
    submit.mutate(
      {
        ...common,
        kind,
        specialKindId: kind === 'special' ? special : null,
        items: items.trim(),
        specialRequired: kind === 'ofs' ? specialRequired : null,
        inspectorAck,
      },
      {
        ...back,
        onSuccess: (row) => {
          done(row, false);
        },
      },
    );
  }

  const typeRow = (
    <ChoiceRow
      label="Type"
      options={kindOptions(ctx.ofs)}
      value={kind}
      onPick={(next) => {
        setKind(next);
        if (!dayPicked) setWhen({ ...when, date: dayFor(next, day, ctx.today) });
      }}
      testId="ir-kind"
      large
    />
  );
  // An OFS request with walls to pick: what to inspect comes first (Jesse, Oct 10), under the type.
  const ofsFields =
    plan !== null && revs !== null ? (
      <OfsFields projectId={projectId} revs={revs} pick={pick} onPick={setPick} sheet={sheet} onSheet={setSheet} date={when.date} />
    ) : null;

  return (
    <form
      className="flex min-h-full flex-col"
      data-testid="ir-form"
      onSubmit={(e) => {
        e.preventDefault();
        if (!ready) return;
        if (attests) setAttesting(true);
        else send();
      }}
    >
      {attesting ? (
        <AttestDialog
          text={wording.data}
          notice={NOTICE_STATEMENT}
          error={wording.isError ? wording.error : null}
          onRetry={() => void wording.refetch()}
          sending={sending.isPending}
          onConfirm={send}
          onBack={() => {
            setAttesting(false);
          }}
        />
      ) : null}
      <div className="flex flex-1 flex-col gap-3 p-4">
        <p className="break-words rounded-md bg-page px-3 py-2 text-[13px] text-ink-2">
          {job.name}
          {ctx.gc ? ` · GC ${ctx.gc}` : ''}
          {ctx.inspectors.length > 0 ? ` · Inspector ${ctx.inspectors.join(', ')}` : ''}
        </p>
        {ofsFields ? typeRow : null}
        {ofsFields}
        <CompanyField value={company} companies={ctx.companies} onChange={setCompany} />
        <WhenFields
          value={when}
          onChange={(next) => {
            if (next.date !== when.date) setDayPicked(true);
            setWhen(next);
          }}
          testId="ir"
        />
        {ofsFields ? null : typeRow}
        {kind === 'special' ? <SpecialPick kinds={ctx.kinds} value={special} onChange={setSpecial} testId="ir-special" /> : null}
        {ofsFields ? null : <ItemsText value={items} onChange={setItems} />}
        {kind === 'ofs' ? <SpecialQuestion value={specialRequired} onChange={setSpecialRequired} testId="ir-special-required" /> : null}
        <AttachmentsField projectId={projectId} label="Photos or PDFs" files={files} onChange={setFiles} onBusy={setUploading} />
        <ConflictPreview projectId={projectId} when={whenValue} ownId={null} />
        {attests ? null : <NoticeBox checked={ack} onChange={setAck} />}
        {kind === 'ofs' && inspector ? <InspectorStatement checked={stated} onChange={setStated} /> : null}
        {sending.isError ? <p className="text-sm text-danger">{messageOf(sending.error)}</p> : null}
      </div>
      <SubmitBar ready={ready} sending={sending.isPending} />
    </form>
  );
}

type Common = Omit<BodyProps, 'revs'>;

/** An OFS job: its revs load with the form; walls to pick replace typing the items. */
function OfsRequestForm(props: Common) {
  const setup = useRevSetup(props.projectId);
  const status = useRevStatus(props.projectId);
  const search: PrefillSearch = useSearch({ strict: false });
  if (setup.isError) return <ErrorState error={setup.error} onRetry={() => void setup.refetch()} />;
  if (setup.isPending) return <LoadingState label="Loading the form" />;
  if (listsWithWalls(setup.data).length === 0) return <RequestFormBody {...props} revs={null} />;
  if (status.isError) return <ErrorState error={status.error} onRetry={() => void status.refetch()} />;
  if (status.isPending) return <LoadingState label="Loading the form" />;
  const start = prefillPick(setup.data, statusIndex(status.data), search.areas, search.items);
  return <RequestFormBody {...props} revs={{ setup: setup.data, status: status.data, start }} />;
}

export function RequestForm({ projectId }: { projectId: string }) {
  const access = useIrAccess(projectId);
  const ctx = useIrFormContext(projectId);
  const search: PrefillSearch = useSearch({ strict: false });
  const zone = access.state === 'ready' ? access.job.tz : 'UTC';
  const day = useSelectedDay(todayInZone(zone));
  if (access.state === 'error') return <ErrorState error={access.error} onRetry={access.retry} />;
  if (ctx.isError) return <ErrorState error={ctx.error} onRetry={() => void ctx.refetch()} />;
  if (access.state === 'loading' || !ctx.data) return <LoadingState label="Loading the form" />;
  const props = { projectId, job: access.job, ctx: ctx.data, day, inspector: access.can.decide };
  // A new link from Revs (other walls, other items) starts a new form.
  const key = `${projectId}|${search.areas ?? ''}|${search.items ?? ''}`;
  return ctx.data.ofs ? <OfsRequestForm key={key} {...props} /> : <RequestFormBody key={projectId} {...props} revs={null} />;
}
