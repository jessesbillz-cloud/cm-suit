// Settings > Job: the job's own fields, saved as I go (text on blur, the rest on change) with a version check.
// Shown only with project.manage, the same rule as the projects update policy. Bid fields show when Bids is on.
import { useMemo, useState } from 'react';
import { messageOf } from '../../data/errors';
import { useSaveProject } from '../../data/jobs.mutations';
import { useCapability, useProject, type ProjectWithSettings } from '../../data/queries';
import type { ProjectPatch } from '../../data/types';
import { fromZonedInput, toZonedInput } from '../../lib/dates';
import { MODULES, STAGES } from '../../lib/jobs';
import { Card } from '../../ui/Card';
import { CheckField, SelectField, TextField } from '../../ui/Fields';
import { SaveState } from '../../ui/SaveState';
import { ErrorState, LoadingState } from '../../ui/States';
import { InspectionSettings } from '../inspections/InspectionSettings';

type TextKey = 'name' | 'number' | 'address' | 'job_type';

function textOf(row: ProjectWithSettings, key: TextKey): string {
  return row[key] ?? '';
}

function JobFields({ row }: { row: ProjectWithSettings }) {
  const save = useSaveProject(row.id);
  const zones = useMemo(() => Intl.supportedValuesOf('timeZone').map((z) => ({ value: z, label: z })), []);
  const [text, setText] = useState<Record<TextKey, string>>({
    name: textOf(row, 'name'),
    number: textOf(row, 'number'),
    address: textOf(row, 'address'),
    job_type: textOf(row, 'job_type'),
  });
  const savedBidDue = row.bid_due_at ? toZonedInput(row.bid_due_at, row.timezone) : '';
  const [bidDue, setBidDue] = useState(savedBidDue);
  const [problem, setProblem] = useState<string | null>(null);

  function commit(patch: ProjectPatch) {
    setProblem(null);
    save.mutate(patch, {
      onError: (e) => {
        setProblem(messageOf(e));
      },
    });
  }

  function commitText(key: TextKey) {
    const value = text[key].trim();
    if (value === textOf(row, key)) return;
    if (key === 'name') {
      if (value === '') {
        setProblem('Name is empty.');
        return;
      }
      commit({ name: value });
      return;
    }
    const patch: ProjectPatch = {};
    patch[key] = value === '' ? null : value;
    commit(patch);
  }

  function textField(key: TextKey, label: string, wide = false) {
    return (
      <TextField
        label={label}
        value={text[key]}
        className={wide ? 'sm:col-span-2' : ''}
        onChange={(v) => {
          setText({ ...text, [key]: v });
        }}
        onBlur={() => {
          commitText(key);
        }}
      />
    );
  }

  const bidsOn = row.modules.includes('bids');

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {textField('name', 'Job name', true)}
      {textField('number', 'Job number')}
      <SelectField
        label="Stage"
        value={row.stage}
        options={STAGES}
        onChange={(stage) => {
          commit({ stage });
        }}
      />
      {textField('address', 'Address', true)}
      {textField('job_type', 'Job type')}
      <SelectField
        label="Time zone"
        value={row.timezone}
        options={zones}
        onChange={(timezone) => {
          commit({ timezone });
        }}
      />
      <CheckField
        label="Prevailing wage"
        checked={row.prevailing_wage}
        onChange={(prevailing_wage) => {
          commit({ prevailing_wage });
        }}
      />
      {bidsOn ? (
        <>
          <TextField
            label="Bid due"
            type="datetime-local"
            value={bidDue}
            onChange={setBidDue}
            onBlur={() => {
              if (bidDue !== savedBidDue) commit({ bid_due_at: fromZonedInput(bidDue, row.timezone) });
            }}
          />
          <CheckField
            label="Sealed bids"
            checked={row.bid_sealed}
            onChange={(bid_sealed) => {
              commit({ bid_sealed });
            }}
          />
        </>
      ) : null}
      <fieldset className="flex flex-col sm:col-span-2">
        <legend className="mb-1 text-xs font-medium text-ink-2">Tools on this job</legend>
        <div className="flex flex-wrap gap-x-5">
          {MODULES.map((m) => (
            <CheckField
              key={m.value}
              label={m.label}
              checked={row.modules.includes(m.value)}
              onChange={(on) => {
                const set = new Set(row.modules);
                if (on) set.add(m.value);
                else set.delete(m.value);
                commit({ modules: MODULES.map((x) => x.value).filter((v) => set.has(v)) });
              }}
            />
          ))}
        </div>
      </fieldset>
      {row.modules.includes('inspections') ? <InspectionSettings row={row} /> : null}
      <div className="sm:col-span-2">
        <SaveState pending={save.isPending} saved={save.isSuccess} problem={problem} />
      </div>
    </div>
  );
}

export function JobSettings({ projectId }: { projectId: string }) {
  const can = useCapability(projectId, 'project.manage');
  const project = useProject(projectId);

  if (can.isError) return <ErrorState error={can.error} onRetry={() => void can.refetch()} />;
  if (can.data !== true) return null;
  return (
    <Card title="Job">
      {project.isPending ? <LoadingState label="Loading the job" /> : null}
      {project.isError ? <ErrorState error={project.error} onRetry={() => void project.refetch()} /> : null}
      {/* Keyed on the job, not the version: my typing survives each autosave. */}
      {project.data ? <JobFields key={project.data.id} row={project.data} /> : null}
    </Card>
  );
}
