// Correct what the AI read before Confirm (SPEC §11.6, rule 12): bidder, bid date, prevailing wage, valid days, and for
// pricing roles the base amount. Confirm saves the corrections and confirms in one go; nothing feeds leveling unread.
import { useState } from 'react';
import { Check } from 'lucide-react';
import { useConfirmExtraction } from '../../data/bids.mutations';
import type { ExtractionRow, FindingsEdits } from '../../data/bids.types';
import { messageOf } from '../../data/errors';
import { Button } from '../../ui/Button';
import { SelectField, TextField } from '../../ui/Fields';
import { pwLabel } from './leveling';

const PW = ['included', 'excluded', 'adder', 'not_stated'] as const;
const PW_OPTIONS = [{ value: '', label: '-' }, ...PW.map((v) => ({ value: v, label: pwLabel(v) }))];

/** Whole dollars and cents as typed ("$12,400.50"); null when empty; undefined when it isn't a number. */
function parseAmount(text: string): number | null | undefined {
  const t = text.replace(/[$,\s]/g, '');
  if (t === '') return null;
  return /^\d+(\.\d{1,2})?$/.test(t) ? Number(t) : undefined;
}

interface FindingsEditProps {
  projectId: string;
  x: ExtractionRow;
  /** The bid's base amount when the caller is a pricing role and the bid has a pricing row; else money stays out. */
  base: number | null | undefined;
}

export function FindingsEdit({ projectId, x, base }: FindingsEditProps) {
  const confirm = useConfirmExtraction();
  const [bidder, setBidder] = useState(x.bidder_name ?? '');
  const [date, setDate] = useState(x.bid_date ?? '');
  const [pw, setPw] = useState(x.prevailing_wage ?? '');
  const [valid, setValid] = useState(x.validity_days === null ? '' : String(x.validity_days));
  const [amount, setAmount] = useState(base === null || base === undefined ? '' : String(base));
  const [problem, setProblem] = useState<string | null>(null);

  function send() {
    const days = valid.trim() === '' ? null : Number(valid);
    if (days !== null && (!Number.isInteger(days) || days < 0 || days > 3650)) {
      setProblem('Valid is a number of days.');
      return;
    }
    const money = base === undefined ? undefined : parseAmount(amount);
    if (base !== undefined && money === undefined) {
      setProblem('Base is an amount, like 12400.50.');
      return;
    }
    const edits: FindingsEdits = {
      bidder_name: bidder.trim() === '' ? null : bidder.trim(),
      bid_date: date === '' ? null : date,
      prevailing_wage: pw === '' ? null : pw,
      validity_days: days,
      ...(money !== undefined && money !== base ? { base_amount: money } : {}),
    };
    setProblem(null);
    confirm.mutate(
      { projectId, x, edits },
      {
        onError: (e) => {
          setProblem(messageOf(e));
        },
      },
    );
  }

  return (
    <form
      className="flex flex-col gap-3 rounded-lg border border-line p-3"
      data-testid="findings-edit"
      onSubmit={(e) => {
        e.preventDefault();
        send();
      }}
    >
      <TextField label="Bidder" value={bidder} onChange={setBidder} testId="findings-bidder" />
      <div className="grid grid-cols-2 gap-3">
        <TextField label="Bid date" type="date" value={date} onChange={setDate} testId="findings-date" />
        <TextField label="Valid (days)" value={valid} onChange={setValid} testId="findings-valid" />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <SelectField label="Prevailing wage" value={pw} options={PW_OPTIONS} onChange={setPw} testId="findings-pw" />
        {base !== undefined ? <TextField label="Base" value={amount} onChange={setAmount} testId="findings-base" /> : null}
      </div>
      {problem ? <p className="text-sm text-danger">{problem}</p> : null}
      <Button type="submit" variant="primary" icon={Check} className="w-fit" loading={confirm.isPending} data-testid="findings-confirm">
        Confirm
      </Button>
    </form>
  );
}
