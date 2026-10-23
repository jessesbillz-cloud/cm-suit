// The review's own fields and Send (0113), the OFS request form's (0091): the company (mine on the job, prefilled), the
// day (the next working day), time and length (the last used here), the special inspection question, and the
// statement: the inspector's one box, anyone else's I confirm in the attestation dialog, which states the notice too.
// Send carries the version reviewed and the OFS numbers when they are typed; until it can go, the line above it says
// what is missing.
import { useState } from 'react';
import { Send } from 'lucide-react';
import { messageOf } from '../../../data/errors';
import { useOfsAttestText } from '../../../data/inspections.ofs';
import type { FormContext } from '../../../data/inspections.types';
import { useBasketSend, type Batch } from '../../../data/revs.basket';
import { Button } from '../../../ui/Button';
import { AttestDialog } from '../../inspections/AttestDialog';
import { NOTICE_STATEMENT } from '../../inspections/model';
import { InspectorStatement, SpecialQuestion } from '../../inspections/OfsAsk';
import { recallWhen, rememberWhen, startWhen } from '../../inspections/requestStart';
import { CompanyField } from '../../inspections/RequestParts';
import { isDay, whenOf, type WhenPick } from '../../inspections/time';
import { WhenFields } from '../../inspections/WhenFields';

interface ReviewSendProps {
  projectId: string;
  version: number;
  ctx: FormContext;
  /** I decide inspections here: my one statement, and my requests go straight to OFS. */
  inspector: boolean;
  /** The OFS numbers typed, in Send's order, or null (the database's). Undefined: one is not a number. */
  ofsNumbers: number[] | null | undefined;
  onSent: (batch: Batch) => void;
}

export function ReviewSend({ projectId, version, ctx, inspector, ofsNumbers, onSent }: ReviewSendProps) {
  const send = useBasketSend();
  const [company, setCompany] = useState(ctx.my_company ?? ctx.companies[0] ?? ctx.gc ?? '');
  const [when, setWhen] = useState<WhenPick>(() => startWhen('ofs', ctx.today, ctx.today, recallWhen(projectId)));
  const [special, setSpecial] = useState<boolean | null>(null);
  const [stated, setStated] = useState(false);
  const [attesting, setAttesting] = useState(false);
  const wording = useOfsAttestText(projectId, !inspector);
  const missing =
    company.trim() === '' ? 'Add the company.'
    : !isDay(when.date) ? 'Pick the day.'
    : special === null ? 'Answer the special inspection question.'
    : inspector && !stated ? 'Check the statement.'
    : ofsNumbers === undefined ? 'Type each OFS number.'
    : null;

  function go() {
    if (special === null || ofsNumbers === undefined) return;
    send.mutate(
      {
        projectId, version, company, ...whenOf(when), noticeAck: true, specialRequired: special, inspectorAck: inspector && stated,
        ofsNumbers,
      },
      {
        onSuccess: (batch) => {
          rememberWhen(projectId, when);
          onSent(batch);
        },
        onError: () => {
          setAttesting(false);
        },
      },
    );
  }

  return (
    <div className="flex flex-col gap-3" data-testid="basket-send-form">
      {attesting ? (
        <AttestDialog
          text={wording.data}
          notice={NOTICE_STATEMENT}
          error={wording.isError ? wording.error : null}
          onRetry={() => void wording.refetch()}
          sending={send.isPending}
          onConfirm={go}
          onBack={() => {
            setAttesting(false);
          }}
        />
      ) : null}
      <CompanyField value={company} companies={ctx.companies} onChange={setCompany} />
      <WhenFields value={when} onChange={setWhen} testId="ir" />
      <SpecialQuestion value={special} onChange={setSpecial} testId="ir-special-required" />
      {inspector ? <InspectorStatement checked={stated} onChange={setStated} /> : null}
      {send.isError ? (
        <p className="text-sm text-danger" data-testid="basket-send-error">
          {messageOf(send.error)}
        </p>
      ) : null}
      <div className="sticky bottom-0 z-10 flex flex-col gap-1.5 border-t border-line bg-card py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        {missing !== null ? (
          <span className="text-[13px] font-medium text-ink-2" data-testid="basket-missing">
            {missing}
          </span>
        ) : null}
        <Button
          variant="primary"
          size="lg"
          icon={Send}
          loading={send.isPending}
          disabled={missing !== null}
          className="w-full sm:w-auto sm:self-end"
          data-testid="basket-send"
          onClick={() => {
            if (inspector) go();
            else setAttesting(true);
          }}
        >
          Send
        </Button>
      </div>
    </div>
  );
}
