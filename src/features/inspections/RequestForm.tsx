// A new inspection request (SPEC §13.2). Prefilled: job, GC, inspector, my company, the day being looked at. The IR
// number comes from the database on submit. Before sending, that day's bookings show (anonymized). A request, not a
// booking: nothing is refused for notice or overlaps. On an OFS job with revs, an OFS request picks walls and items
// instead of typing them (prefilled from the Revs link: ?areas=&items=), and its map is drawn right after sending.
import { useState } from 'react';
import { useSearch } from '@tanstack/react-router';
import { Send } from 'lucide-react';
import { messageOf } from '../../data/errors';
import { useSubmitIr, type IrUpload } from '../../data/inspections.mutations';
import { useIrFormContext } from '../../data/inspections.queries';
import type { FormContext, IrKind, IrRowRaw } from '../../data/inspections.types';
import { useSubmitOfs } from '../../data/revs.mutations';
import { useRevSetup, useRevStatus } from '../../data/revs.queries';
import { todayInZone } from '../../lib/dates';
import { Button } from '../../ui/Button';
import { ErrorState, LoadingState } from '../../ui/States';
import { listsWithWalls, prefillPick, requestPlan, statusIndex, type RevPick } from '../revs/revPick';
import { AttachmentsField } from './AttachmentsField';
import { ChoiceRow } from './ChoiceRow';
import { ConflictPreview } from './ConflictPreview';
import { IrMap } from './IrMap';
import { OfsFields, type OfsRevs } from './OfsFields';
import { Receipt } from './Receipt';
import { SpecialPick } from './SpecialPick';
import { useOpenRequest, useSelectedDay } from './useInspectionsNav';
import { useIrAccess, type IrJob } from './useIrAccess';
import { DEFAULT_DURATION, FLEXIBLE, isDay, requestDay, whenOf, type WhenPick } from './time';
import { WhenFields } from './WhenFields';

const LABEL = 'flex flex-col gap-1 text-xs font-medium text-ink-2';
const INPUT = 'rounded-md border border-line-strong bg-card px-2.5 text-sm font-normal text-ink outline-none focus:border-accent';

interface BodyProps {
  projectId: string;
  job: IrJob;
  ctx: FormContext;
  day: string;
  /** The job's revs, when it has walls to pick (an OFS job). */
  revs: OfsRevs | null;
}

interface Sent {
  row: IrRowRaw;
  /** Sent with walls: it has a map to draw. */
  map: boolean;
}

/** The link from Revs: the walls and items to start from. */
interface PrefillSearch {
  areas?: string | undefined;
  items?: string | undefined;
}

function kindOptions(ofs: boolean): { value: IrKind; label: string }[] {
  return [{ value: 'ior', label: 'IOR' }, { value: 'special', label: 'Special' }, ...(ofs ? [{ value: 'ofs' as const, label: 'OFS' }] : [])];
}

function RequestFormBody({ projectId, job, ctx, day, revs }: BodyProps) {
  const submit = useSubmitIr();
  const submitOfs = useSubmitOfs();
  const track = useOpenRequest(projectId);
  const linked = revs !== null && (revs.start.areaIds.length > 0 || revs.start.itemIds.length > 0);
  const [when, setWhen] = useState<WhenPick>({ date: requestDay(day, ctx.today), time: FLEXIBLE, duration: DEFAULT_DURATION });
  const [company, setCompany] = useState(ctx.my_company ?? ctx.companies[0] ?? '');
  const [kind, setKind] = useState<IrKind>(linked ? 'ofs' : 'ior');
  const [special, setSpecial] = useState('');
  const [items, setItems] = useState('');
  const [pick, setPick] = useState<RevPick>(revs?.start ?? { listId: null, areaIds: [], itemIds: [] });
  const [sheet, setSheet] = useState<string | null>(null);
  const [files, setFiles] = useState<IrUpload[]>([]);
  const [uploading, setUploading] = useState(false);
  const [ack, setAck] = useState(false);
  const [sent, setSent] = useState<Sent | null>(null);
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
        }}
      >
        {sent.map ? <IrMap requestId={sent.row.id} projectId={projectId} editing /> : null}
      </Receipt>
    );
  }

  const what = plan !== null ? plan.items.length > 0 && plan.walls.length > 0 : items.trim() !== '';
  const ready = isDay(when.date) && company.trim() !== '' && what && ack && !uploading && (kind !== 'special' || special !== '');
  const whenValue = whenOf(when);

  return (
    <form
      className="flex min-h-full flex-col"
      data-testid="ir-form"
      onSubmit={(e) => {
        e.preventDefault();
        if (!ready) return;
        const common = { projectId, company: company.trim(), attachmentIds: files.map((f) => f.id), noticeAck: ack, ...whenValue };
        if (plan !== null) {
          const areaIds = plan.walls.map((a) => a.id);
          const itemIds = plan.items.map((r) => r.item.id);
          submitOfs.mutate(
            { ...common, areaIds, itemIds, sheetFileId: sheet },
            {
              onSuccess: (row) => {
                setSent({ row, map: true });
              },
            },
          );
          return;
        }
        submit.mutate(
          { ...common, kind, specialKindId: kind === 'special' ? special : null, items: items.trim() },
          {
            onSuccess: (row) => {
              setSent({ row, map: false });
            },
          },
        );
      }}
    >
      <div className="flex flex-1 flex-col gap-3 p-4">
        <p className="break-words rounded-md bg-page px-3 py-2 text-[13px] text-ink-2">
          {job.name}
          {ctx.gc ? ` · GC ${ctx.gc}` : ''}
          {ctx.inspectors.length > 0 ? ` · Inspector ${ctx.inspectors.join(', ')}` : ''}
        </p>
        <label className={LABEL}>
          Company
          <input
            className={`h-9 ${INPUT}`}
            list="ir-companies"
            value={company}
            data-testid="ir-company"
            onChange={(e) => {
              setCompany(e.target.value);
            }}
          />
          <datalist id="ir-companies">
            {ctx.companies.map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
        </label>
        <WhenFields value={when} onChange={setWhen} testId="ir" />
        <ChoiceRow label="Type" options={kindOptions(ctx.ofs)} value={kind} onPick={setKind} testId="ir-kind" large />
        {kind === 'special' ? <SpecialPick kinds={ctx.kinds} value={special} onChange={setSpecial} testId="ir-special" /> : null}
        {plan !== null && revs !== null ? (
          <OfsFields projectId={projectId} revs={revs} pick={pick} onPick={setPick} sheet={sheet} onSheet={setSheet} date={when.date} />
        ) : (
          <label className={LABEL}>
            Items to inspect
            <textarea
              rows={4}
              className={`py-2 ${INPUT}`}
              value={items}
              data-testid="ir-items"
              onChange={(e) => {
                setItems(e.target.value);
              }}
            />
          </label>
        )}
        <AttachmentsField projectId={projectId} label="Photos or PDFs" files={files} onChange={setFiles} onBusy={setUploading} />
        <ConflictPreview projectId={projectId} when={whenValue} ownId={null} />
        <label className="flex items-start gap-2 text-sm text-ink">
          <input
            type="checkbox"
            className="mt-0.5 h-4 w-4 accent-accent"
            checked={ack}
            data-testid="ir-ack"
            onChange={(e) => {
              setAck(e.target.checked);
            }}
          />
          <span>24 hours notice (48 for special). I&apos;ll be present, with safe access and plans on site.</span>
        </label>
        {sending.isError ? <p className="text-sm text-danger">{messageOf(sending.error)}</p> : null}
      </div>
      <div className="sticky bottom-0 z-10 flex items-center justify-between gap-3 border-t border-line bg-card px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] shadow-[0_-8px_16px_-12px_rgba(16,24,40,.25)]">
        <span className="text-sm text-ink-2">A request, not a booking.</span>
        <Button
          type="submit"
          variant="primary"
          icon={Send}
          className="h-11 px-6 text-base"
          disabled={!ready}
          loading={sending.isPending}
          data-testid="ir-submit"
        >
          Request
        </Button>
      </div>
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
  const props = { projectId, job: access.job, ctx: ctx.data, day };
  // A new link from Revs (other walls, other items) starts a new form.
  const key = `${projectId}|${search.areas ?? ''}|${search.items ?? ''}`;
  return ctx.data.ofs ? <OfsRequestForm key={key} {...props} /> : <RequestFormBody key={projectId} {...props} revs={null} />;
}
