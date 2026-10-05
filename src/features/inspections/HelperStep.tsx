// Co-inspectors: the owner picks a helper (another inspector on the job) or a helper claims one. The helper reports
// Passed / Issues; only the owner decides, generates and sends. Who can help comes from the capability matrix.
import { useState } from 'react';
import { messageOf } from '../../data/errors';
import { useAssignHelper, useClaimIr, useHelperReport } from '../../data/inspections.decide';
import { useDecideRoles } from '../../data/inspections.queries';
import type { IrRequest } from '../../data/inspections.types';
import { usePeopleDisplay } from '../../data/queries';
import { Button } from '../../ui/Button';
import { SelectField, TextField } from '../../ui/Fields';
import { ErrorState, LoadingState } from '../../ui/States';
import { useToast } from '../../ui/Toast';
import { ChoiceRow } from './ChoiceRow';

const REPORTS = [
  { value: 'passed', label: 'Passed' },
  { value: 'issues', label: 'Issues' },
] as const;
type Report = (typeof REPORTS)[number]['value'];

interface HelperStepProps {
  row: IrRequest;
  me: string;
  /** I may act as the owner (no owner yet, or it's me). */
  owner: boolean;
}

function HelperReport({ row }: { row: IrRequest }) {
  const report = useHelperReport();
  const assign = useAssignHelper();
  const toast = useToast();
  const [note, setNote] = useState(row.helper_note ?? '');
  const value = REPORTS.find((r) => r.value === row.helper_report)?.value ?? null;
  const onError = (e: Error) => {
    toast.show({ tone: 'error', message: messageOf(e) });
  };
  return (
    <div className="flex flex-col gap-2" data-testid="ir-helper-report">
      <div className="flex flex-wrap items-center gap-2">
        <ChoiceRow<Report>
          label="Report"
          options={REPORTS}
          value={value}
          disabled={report.isPending}
          onPick={(v) => {
            report.mutate({ row, report: v === value ? null : v, note }, { onError });
          }}
        />
        <Button
          size="sm"
          variant="quiet"
          loading={assign.isPending}
          onClick={() => {
            assign.mutate({ row, helperId: null }, { onError });
          }}
        >
          Step off
        </Button>
      </div>
      <TextField
        label="Note for the inspector"
        value={note}
        onChange={setNote}
        onBlur={() => {
          if (note.trim() !== (row.helper_note ?? '')) report.mutate({ row, report: value, note }, { onError });
        }}
      />
    </div>
  );
}

export function HelperStep({ row, me, owner }: HelperStepProps) {
  const people = usePeopleDisplay(row.project_id);
  const roles = useDecideRoles();
  const assign = useAssignHelper();
  const claim = useClaimIr();
  const toast = useToast();
  const onError = (e: Error) => {
    toast.show({ tone: 'error', message: messageOf(e) });
  };

  if (row.helper_id === me) return <HelperReport row={row} />;
  if (!owner) {
    if (row.helper_id !== null) return null;
    return (
      <div>
        <Button
          size="sm"
          loading={claim.isPending}
          onClick={() => {
            claim.mutate(row, { onError });
          }}
        >
          Help
        </Button>
      </div>
    );
  }
  if (people.isError || roles.isError) {
    return (
      <ErrorState
        title="Helpers did not load."
        error={people.error ?? roles.error}
        className="m-0"
        onRetry={() => {
          void people.refetch();
          void roles.refetch();
        }}
      />
    );
  }
  if (people.isPending || roles.isPending) return <LoadingState label="Loading helpers" />;
  const others = people.data.filter((p) => p.user_id !== null && p.user_id !== me && roles.data.includes(p.role));
  if (others.length === 0 && row.helper_id === null) return null;
  const options = [{ value: '', label: 'None' }, ...others.map((p) => ({ value: p.user_id ?? '', label: p.full_name }))];
  return (
    <SelectField
      label="Helper"
      value={row.helper_id ?? ''}
      options={options}
      className="max-w-xs"
      onChange={(v) => {
        assign.mutate({ row, helperId: v === '' ? null : v }, { onError });
      }}
    />
  );
}
