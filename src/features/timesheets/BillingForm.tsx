// My billing details (right column): what my invoices print (business name, address, bill to, terms), my rate, the
// next invoice number (to continue a sequence), and a job's own rate where it differs. Only I can read any of it.
import { useState } from 'react';
import { Save } from 'lucide-react';
import { messageOf } from '../../data/errors';
import { useSaveBillingProfile, useSetJobRate } from '../../data/hours.mutations';
import { useBillingProfile, useHoursJobs, useJobRates } from '../../data/hours.queries';
import type { BillingProfileRow, HoursJob, JobRateRow } from '../../data/hours.types';
import { useProfile } from '../../data/queries';
import { Button } from '../../ui/Button';
import { FIELD_AREA, FIELD_CONTROL, FIELD_LABEL, TextField } from '../../ui/Fields';
import { SaveState } from '../../ui/SaveState';
import { ErrorState, LoadingState } from '../../ui/States';
import { useToast } from '../../ui/Toast';

/** Dollars as typed ("90", "92.50"), or null when not a price. */
function dollars(text: string): number | null {
  const t = text.trim().replace(/^\$/, '').replace(/,/g, '');
  return /^\d{1,6}(\.\d{1,2})?$/.test(t) ? Number(t) : null;
}

interface AreaProps {
  label: string;
  value: string;
  onChange: (v: string) => void;
  testId: string;
}

function Area({ label, value, onChange, testId }: AreaProps) {
  return (
    <label className={FIELD_LABEL}>
      {label}
      <textarea
        rows={3}
        className={FIELD_AREA}
        value={value}
        data-testid={testId}
        onChange={(e) => {
          onChange(e.target.value);
        }}
      />
    </label>
  );
}

interface RateProps {
  job: HoursJob;
  row: JobRateRow | undefined;
  usual: number | null;
}

/** A job's own rate: saved when the field is left; empty = my usual rate. */
function JobRate({ job, row, usual }: RateProps) {
  const set = useSetJobRate();
  const [text, setText] = useState(row?.rate === null || row === undefined ? '' : String(row.rate));
  const [problem, setProblem] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  function commit() {
    const rate = text.trim() === '' ? null : dollars(text);
    if (text.trim() !== '' && rate === null) {
      setProblem('Dollars, like 90 or 92.50.');
      return;
    }
    if (rate === (row?.rate ?? null)) return;
    setProblem(null);
    set.mutate(
      { projectId: job.project_id, rate, version: row?.version ?? null },
      {
        onSuccess: () => {
          setSaved(true);
        },
        onError: (e) => {
          setProblem(messageOf(e));
        },
      },
    );
  }

  return (
    <li className="flex flex-col gap-1 py-2">
      <div className="flex items-center gap-3">
        <span className="min-w-0 flex-1 break-words text-sm text-ink">{job.name}</span>
        <input
          type="text"
          inputMode="decimal"
          aria-label={`Rate for ${job.name}`}
          placeholder={usual === null ? '$/h' : String(usual)}
          value={text}
          data-testid={`job-rate-${job.project_id}`}
          className={`${FIELD_CONTROL} w-24 text-right tabular-nums`}
          onChange={(e) => {
            setSaved(false);
            setText(e.target.value);
          }}
          onBlur={commit}
        />
      </div>
      <SaveState pending={set.isPending} saved={saved} problem={problem} />
    </li>
  );
}

interface FormProps {
  profile: BillingProfileRow | null;
  fullName: string;
  jobs: readonly HoursJob[];
  rates: readonly JobRateRow[];
}

function Form({ profile, fullName, jobs, rates }: FormProps) {
  const save = useSaveBillingProfile();
  const toast = useToast();
  const [name, setName] = useState(profile?.business_name ?? fullName);
  const [address, setAddress] = useState(profile?.address ?? '');
  const [billTo, setBillTo] = useState(profile?.bill_to ?? '');
  const [rate, setRate] = useState(profile?.rate === null || profile === null ? '' : String(profile.rate));
  const [terms, setTerms] = useState(profile?.terms ?? '');
  const [next, setNext] = useState(String(profile?.next_invoice_number ?? 1));
  const [problem, setProblem] = useState<string | null>(null);

  function submit() {
    const r = rate.trim() === '' ? null : dollars(rate);
    const n = Number(next);
    if (rate.trim() !== '' && r === null) {
      setProblem('Rate: dollars, like 90 or 92.50.');
      return;
    }
    if (!Number.isInteger(n) || n < 1) {
      setProblem('Next invoice #: a whole number.');
      return;
    }
    setProblem(null);
    save.mutate(
      { businessName: name, address, billTo, terms, rate: r, nextNumber: n, version: profile?.version ?? null },
      {
        onSuccess: () => {
          toast.show({ message: 'Billing saved.' });
        },
        onError: (e) => {
          setProblem(messageOf(e));
        },
      },
    );
  }

  return (
    <div className="flex flex-col gap-5 p-4" data-testid="billing-form">
      <form
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <TextField label="Business name" value={name} onChange={setName} testId="billing-name" />
        <Area label="Address" value={address} onChange={setAddress} testId="billing-address" />
        <Area label="Bill to" value={billTo} onChange={setBillTo} testId="billing-bill-to" />
        <div className="grid grid-cols-2 gap-3">
          <TextField label="Rate ($/h)" value={rate} onChange={setRate} testId="billing-rate" />
          <TextField label="Next invoice #" value={next} onChange={setNext} testId="billing-next" />
        </div>
        <TextField label="Terms" value={terms} onChange={setTerms} testId="billing-terms" />
        {problem !== null ? (
          <p role="alert" className="text-sm text-danger">
            {problem}
          </p>
        ) : null}
        <div>
          <Button type="submit" variant="primary" icon={Save} loading={save.isPending} data-testid="billing-save">
            Save
          </Button>
        </div>
      </form>
      {jobs.length > 0 && profile !== null ? (
        <section className="flex flex-col gap-1 border-t border-line pt-4">
          <h3 className="text-[15px] font-semibold text-ink">Rate by job</h3>
          <ul className="divide-y divide-line">
            {jobs.map((j) => (
              <JobRate key={j.project_id} job={j} row={rates.find((r) => r.project_id === j.project_id)} usual={profile.rate} />
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}

export function BillingForm() {
  const profile = useBillingProfile();
  const me = useProfile();
  const jobs = useHoursJobs();
  const rates = useJobRates();
  if (profile.isError || me.isError || jobs.isError || rates.isError) {
    return (
      <ErrorState
        error={profile.error ?? me.error ?? jobs.error ?? rates.error}
        onRetry={() => {
          void profile.refetch();
          void me.refetch();
          void jobs.refetch();
          void rates.refetch();
        }}
      />
    );
  }
  if (profile.isPending || me.isPending || jobs.isPending || rates.isPending) return <LoadingState label="Loading billing" />;
  return (
    <Form
      key={profile.data?.version ?? 0}
      profile={profile.data}
      fullName={me.data.full_name}
      jobs={jobs.data}
      rates={rates.data}
    />
  );
}
