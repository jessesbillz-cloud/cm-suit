// A new inspection request (SPEC §13.2). Prefilled: job, GC, inspector, my company, the day being looked at. The IR
// number comes from the database on submit. Before sending, that day's bookings show (anonymized). A request, not a
// booking: nothing is refused for notice or overlaps. On an OFS job with revs, an OFS request picks walls and items
// instead of typing them (prefilled from the Revs link: ?areas=&items=), and its map is drawn right after sending.
// Every OFS request answers one question (special inspection required?); the inspector filing one himself states,
// once, that the earlier inspections are complete (SPEC §18.4 P1: no box per item). Anyone else confirms the job's
// attestation wording in one small dialog before an OFS request goes (0091), and that same I confirm states the notice
// (Jesse, Oct 10: one statement, not two); the inspector's own statement states it too, one box. Fewer taps (MDR): an
// OFS request starts on the next working day, the time and length last used here are remembered on the device, and the
// receipt files another like this in one tap. Request is never a silent grey button: the bar says the first thing still
// missing and a tap jumps to it (missing.ts). Walls are picked room first (RevPicker, the job's rooms).
import { useRef, useState } from 'react';
import { messageOf } from '../../data/errors';
import { useSubmitIr, type IrUpload } from '../../data/inspections.mutations';
import { useOfsAttestText } from '../../data/inspections.ofs';
import type { FormContext, IrKind, IrRowRaw } from '../../data/inspections.types';
import { useSubmitOfs } from '../../data/revs.mutations';
import { requestPlan, statusIndex, type RevPick } from '../revs/revPick';
import { AttachmentsField } from './AttachmentsField';
import { AttestDialog } from './AttestDialog';
import { ChoiceRow } from './ChoiceRow';
import { ConflictPreview } from './ConflictPreview';
import { IrMap } from './IrMap';
import { MISSING_HINT, missingOf, type Missing } from './missing';
import { jumpTo, Spot } from './MissingSpot';
import { NOTICE_STATEMENT } from './model';
import { InspectorStatement, NoticeBox, SpecialQuestion } from './OfsAsk';
import { OfsFields, type OfsRevs } from './OfsFields';
import { Receipt } from './Receipt';
import { CompanyField, ItemsText, SubmitBar } from './RequestParts';
import { SpecialPick } from './SpecialPick';
import { useOpenRequest } from './useInspectionsNav';
import { againWhen, dayFor, recallWhen, rememberWhen, startWhen } from './requestStart';
import type { IrJob } from './useIrAccess';
import { isDay, whenOf, type WhenPick } from './time';
import { WhenFields } from './WhenFields';

export interface BodyProps {
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

function kindOptions(ofs: boolean): { value: IrKind; label: string }[] {
  return [{ value: 'ior', label: 'IOR' }, { value: 'special', label: 'Special' }, ...(ofs ? [{ value: 'ofs' as const, label: 'OFS' }] : [])];
}

export function RequestFormBody({ projectId, job, ctx, day, inspector, revs }: BodyProps) {
  const submit = useSubmitIr();
  const submitOfs = useSubmitOfs();
  const track = useOpenRequest(projectId);
  const linked = revs !== null && (revs.start.areaIds.length > 0 || revs.start.itemIds.length > 0);
  const [kind, setKind] = useState<IrKind>(linked ? 'ofs' : 'ior');
  const [when, setWhen] = useState<WhenPick>(() => startWhen(kind, day, ctx.today, recallWhen(projectId)));
  // A day picked by hand stays when the type changes; else the day follows the type.
  const [dayPicked, setDayPicked] = useState(false);
  // Mine on the job, else the one most used here, else the job's own (an inspector often has none of his own).
  const [company, setCompany] = useState(ctx.my_company ?? ctx.companies[0] ?? ctx.gc ?? '');
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
  // What a tap on Request jumped to; ringed while it is still the first thing missing.
  const [flagged, setFlagged] = useState<Missing | null>(null);
  const formRef = useRef<HTMLFormElement>(null);
  // The sub's attestation (0091): the dialog is open, the request goes on I confirm.
  const [attesting, setAttesting] = useState(false);
  // The sub's I confirm also states the notice: no box for it.
  const attests = kind === 'ofs' && !inspector;
  // The inspector's own OFS request: his one statement states the notice too.
  const oneStatement = kind === 'ofs' && inspector;
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
          setFlagged(null);
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
          setFlagged(null);
        }}
      >
        {sent.map ? <IrMap requestId={sent.row.id} projectId={projectId} editing /> : null}
      </Receipt>
    );
  }

  const missing = missingOf({
    kind,
    revs: plan !== null ? { items: plan.items.length, walls: plan.walls.length } : null,
    company,
    dayOk: isDay(when.date),
    special,
    items,
    specialRequired,
    uploading,
    box: attests ? null : oneStatement ? 'statement' : 'notice',
    ticked: oneStatement ? stated : ack,
  });
  const first = missing[0] ?? null;
  const flag = flagged !== null && flagged === first ? first : null;
  const ackSent = attests || (oneStatement ? stated : ack);
  const whenValue = whenOf(when);
  const back = {
    onError: () => {
      setAttesting(false);
    },
  };

  function send() {
    const common = { projectId, company: company.trim(), attachmentIds: files.map((f) => f.id), noticeAck: ackSent, ...whenValue };
    const done = (row: IrRowRaw, map: boolean) => {
      rememberWhen(projectId, when);
      setSent({ row, map, when });
    };
    const inspectorAck = oneStatement && stated;
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
      <OfsFields
        projectId={projectId}
        revs={revs}
        pick={pick}
        onPick={setPick}
        sheet={sheet}
        onSheet={setSheet}
        date={when.date}
        flag={flag === 'what' || flag === 'walls' ? flag : null}
      />
    ) : null;

  return (
    <form
      className="flex min-h-full flex-col"
      data-testid="ir-form"
      ref={formRef}
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        if (first !== null) {
          setFlagged(first);
          jumpTo(formRef.current, first);
          return;
        }
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
        <Spot spot="company" flag={flag}>
          <CompanyField value={company} companies={ctx.companies} onChange={setCompany} />
        </Spot>
        <Spot spot="day" flag={flag}>
          <WhenFields
            value={when}
            onChange={(next) => {
              if (next.date !== when.date) setDayPicked(true);
              setWhen(next);
            }}
            testId="ir"
          />
        </Spot>
        {ofsFields ? null : typeRow}
        {kind === 'special' ? (
          <Spot spot="special_kind" flag={flag}>
            <SpecialPick kinds={ctx.kinds} value={special} onChange={setSpecial} testId="ir-special" />
          </Spot>
        ) : null}
        {ofsFields ? null : (
          <Spot spot="items" flag={flag}>
            <ItemsText value={items} onChange={setItems} />
          </Spot>
        )}
        {kind === 'ofs' ? (
          <Spot spot="special_required" flag={flag}>
            <SpecialQuestion value={specialRequired} onChange={setSpecialRequired} testId="ir-special-required" />
          </Spot>
        ) : null}
        <Spot spot="upload" flag={flag}>
          <AttachmentsField projectId={projectId} label="Photos or PDFs" files={files} onChange={setFiles} onBusy={setUploading} />
        </Spot>
        <ConflictPreview projectId={projectId} when={whenValue} ownId={null} />
        {attests ? null : oneStatement ? (
          <Spot spot="statement" flag={flag}>
            <InspectorStatement checked={stated} onChange={setStated} />
          </Spot>
        ) : (
          <Spot spot="notice" flag={flag}>
            <NoticeBox checked={ack} onChange={setAck} />
          </Spot>
        )}
        {sending.isError ? <p className="text-sm text-danger">{messageOf(sending.error)}</p> : null}
      </div>
      <SubmitBar missing={first === null ? null : MISSING_HINT[first]} flagged={flag !== null} sending={sending.isPending} />
    </form>
  );
}
