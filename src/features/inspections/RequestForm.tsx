// A new inspection request (SPEC §13.2). Prefilled: job, GC, inspector, my company, the day being looked at. The IR
// number comes from the database on submit. Before sending, that day's bookings show (anonymized). A request, not a
// booking: nothing is refused for notice or overlaps.
import { useState } from 'react';
import { Send } from 'lucide-react';
import { messageOf } from '../../data/errors';
import { useSubmitIr, type IrUpload } from '../../data/inspections.mutations';
import { useIrFormContext } from '../../data/inspections.queries';
import type { FormContext, IrKind, IrRowRaw } from '../../data/inspections.types';
import { todayInZone } from '../../lib/dates';
import { Button } from '../../ui/Button';
import { SelectField } from '../../ui/Fields';
import { ErrorState, LoadingState } from '../../ui/States';
import { AttachmentsField } from './AttachmentsField';
import { ChoiceRow } from './ChoiceRow';
import { ConflictPreview } from './ConflictPreview';
import { Receipt } from './Receipt';
import { useOpenRequest, useSelectedDay } from './useInspectionsNav';
import { useIrAccess, type IrJob } from './useIrAccess';
import { DEFAULT_DURATION, FLEXIBLE, isDay, requestDay, whenOf, type WhenPick } from './time';
import { WhenFields } from './WhenFields';

const LABEL = 'flex flex-col gap-1 text-xs font-medium text-ink-2';
const INPUT = 'rounded-md border border-line bg-card px-2.5 text-sm font-normal text-ink outline-none focus:border-accent';

interface BodyProps {
  projectId: string;
  job: IrJob;
  ctx: FormContext;
  day: string;
}

function kindOptions(ofs: boolean): { value: IrKind; label: string }[] {
  return [{ value: 'ior', label: 'IOR' }, { value: 'special', label: 'Special' }, ...(ofs ? [{ value: 'ofs' as const, label: 'OFS' }] : [])];
}

function RequestFormBody({ projectId, job, ctx, day }: BodyProps) {
  const submit = useSubmitIr();
  const track = useOpenRequest(projectId);
  const [when, setWhen] = useState<WhenPick>({ date: requestDay(day, ctx.today), time: FLEXIBLE, duration: DEFAULT_DURATION });
  const [company, setCompany] = useState(ctx.my_company ?? ctx.companies[0] ?? '');
  const [kind, setKind] = useState<IrKind>('ior');
  const [special, setSpecial] = useState(ctx.kinds[0]?.id ?? '');
  const [items, setItems] = useState('');
  const [files, setFiles] = useState<IrUpload[]>([]);
  const [uploading, setUploading] = useState(false);
  const [ack, setAck] = useState(false);
  const [sent, setSent] = useState<IrRowRaw | null>(null);

  if (sent) {
    return (
      <Receipt
        row={sent}
        specialName={ctx.kinds.find((k) => k.id === sent.special_kind_id)?.name ?? null}
        onTrack={() => {
          track(sent.id);
        }}
        onAnother={() => {
          setSent(null);
          setItems('');
          setFiles([]);
          setAck(false);
        }}
      />
    );
  }

  const ready =
    isDay(when.date) && company.trim() !== '' && items.trim() !== '' && ack && !uploading && (kind !== 'special' || special !== '');
  const whenValue = whenOf(when);

  return (
    <form
      className="flex flex-col gap-3 p-4"
      data-testid="ir-form"
      onSubmit={(e) => {
        e.preventDefault();
        if (!ready) return;
        submit.mutate(
          {
            projectId, company: company.trim(), kind, specialKindId: kind === 'special' ? special : null, items: items.trim(),
            attachmentIds: files.map((f) => f.id), noticeAck: ack, ...whenValue,
          },
          { onSuccess: setSent },
        );
      }}
    >
      <p className="break-words text-sm text-ink-2">
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
      <div className="flex flex-wrap items-end gap-3">
        <ChoiceRow label="Type" options={kindOptions(ctx.ofs)} value={kind} onPick={setKind} testId="ir-kind" />
        {kind === 'special' ? (
          <SelectField
            label="Special inspection"
            value={special}
            options={ctx.kinds.map((k) => ({ value: k.id, label: k.name }))}
            onChange={setSpecial}
            className="min-w-48 flex-1"
          />
        ) : null}
      </div>
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
      {submit.isError ? <p className="text-sm text-danger">{messageOf(submit.error)}</p> : null}
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm text-ink-2">A request, not a booking.</span>
        <Button type="submit" variant="primary" icon={Send} disabled={!ready} loading={submit.isPending} data-testid="ir-submit">
          Request
        </Button>
      </div>
    </form>
  );
}

export function RequestForm({ projectId }: { projectId: string }) {
  const access = useIrAccess(projectId);
  const ctx = useIrFormContext(projectId);
  const zone = access.state === 'ready' ? access.job.tz : 'UTC';
  const day = useSelectedDay(todayInZone(zone));
  if (access.state === 'error') return <ErrorState error={access.error} onRetry={access.retry} />;
  if (ctx.isError) return <ErrorState error={ctx.error} onRetry={() => void ctx.refetch()} />;
  if (access.state === 'loading' || !ctx.data) return <LoadingState label="Loading the form" />;
  return <RequestFormBody key={projectId} projectId={projectId} job={access.job} ctx={ctx.data} day={day} />;
}
