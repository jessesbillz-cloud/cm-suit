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
import { Icon } from '../../ui/Icon';
import { SaveState } from '../../ui/SaveState';
import { ErrorState, LoadingState } from '../../ui/States';
import { TOOL_META } from '../../ui/tools';
import { InspectionSettings } from '../inspections/InspectionSettings';
import { FIELD_ROW, SettingRow } from './SettingRow';

type TextKey = 'name' | 'number' | 'address' | 'job_type';

function textOf(row: ProjectWithSettings, key: TextKey): string {
  return row[key] ?? '';
}

/** The job's tools, each with its rail icon, in the one MODULES order. */
function ModuleBoxes({ modules, onChange }: { modules: readonly string[]; onChange: (next: string[]) => void }) {
  return (
    <div className="grid grid-cols-2 gap-x-4 sm:grid-cols-3 lg:grid-cols-4">
      {MODULES.map((m) => (
        <label key={m.value} className="flex h-10 cursor-pointer items-center gap-2.5 text-sm text-ink sm:h-9">
          <input
            type="checkbox"
            className="h-4 w-4 shrink-0 accent-accent"
            checked={modules.includes(m.value)}
            onChange={(e) => {
              const on = new Set(modules);
              if (e.target.checked) on.add(m.value);
              else on.delete(m.value);
              onChange(MODULES.map((x) => x.value).filter((v) => on.has(v)));
            }}
          />
          <Icon icon={TOOL_META[m.value].icon} size={16} className="shrink-0 text-ink-2" />
          {m.label}
        </label>
      ))}
    </div>
  );
}

interface JobFieldsProps {
  row: ProjectWithSettings;
  commit: (patch: ProjectPatch) => void;
  onProblem: (problem: string) => void;
}

function JobFields({ row, commit, onProblem }: JobFieldsProps) {
  const zones = useMemo(() => Intl.supportedValuesOf('timeZone').map((z) => ({ value: z, label: z })), []);
  const [text, setText] = useState<Record<TextKey, string>>({
    name: textOf(row, 'name'),
    number: textOf(row, 'number'),
    address: textOf(row, 'address'),
    job_type: textOf(row, 'job_type'),
  });
  const savedBidDue = row.bid_due_at ? toZonedInput(row.bid_due_at, row.timezone) : '';
  const [bidDue, setBidDue] = useState(savedBidDue);

  function commitText(key: TextKey) {
    const value = text[key].trim();
    if (value === textOf(row, key)) return;
    if (key === 'name') {
      if (value === '') {
        onProblem('Name is empty.');
        return;
      }
      commit({ name: value });
      return;
    }
    const patch: ProjectPatch = {};
    patch[key] = value === '' ? null : value;
    commit(patch);
  }

  function textField(key: TextKey, label: string) {
    return (
      <TextField
        label={label}
        value={text[key]}
        className={FIELD_ROW}
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
    <div className="flex flex-col">
      {textField('name', 'Job name')}
      {textField('number', 'Job number')}
      <SelectField
        label="Stage"
        value={row.stage}
        options={STAGES}
        className={FIELD_ROW}
        onChange={(stage) => {
          commit({ stage });
        }}
      />
      {textField('address', 'Address')}
      {textField('job_type', 'Job type')}
      <SelectField
        label="Time zone"
        value={row.timezone}
        options={zones}
        className={FIELD_ROW}
        onChange={(timezone) => {
          commit({ timezone });
        }}
      />
      {bidsOn ? (
        <TextField
          label="Bid due"
          type="datetime-local"
          value={bidDue}
          className={FIELD_ROW}
          onChange={setBidDue}
          onBlur={() => {
            if (bidDue !== savedBidDue) commit({ bid_due_at: fromZonedInput(bidDue, row.timezone) });
          }}
        />
      ) : null}
      <SettingRow label="Options">
        <div className="flex flex-wrap gap-x-6">
          <CheckField
            label="Prevailing wage"
            checked={row.prevailing_wage}
            onChange={(prevailing_wage) => {
              commit({ prevailing_wage });
            }}
          />
          <CheckField
            label="DSA job"
            checked={row.is_dsa}
            testId="job-dsa"
            onChange={(is_dsa) => {
              commit({ is_dsa });
            }}
          />
          {bidsOn ? (
            <CheckField
              label="Sealed bids"
              checked={row.bid_sealed}
              onChange={(bid_sealed) => {
                commit({ bid_sealed });
              }}
            />
          ) : null}
        </div>
      </SettingRow>
      <SettingRow label="Tools on this job">
        <ModuleBoxes
          modules={row.modules}
          onChange={(modules) => {
            commit({ modules });
          }}
        />
      </SettingRow>
      {row.modules.includes('inspections') ? (
        <div className="pt-3">
          <InspectionSettings row={row} />
        </div>
      ) : null}
    </div>
  );
}

export function JobSettings({ projectId }: { projectId: string }) {
  const can = useCapability(projectId, 'project.manage');
  const project = useProject(projectId);
  const save = useSaveProject(projectId);
  const [problem, setProblem] = useState<string | null>(null);

  function commit(patch: ProjectPatch) {
    setProblem(null);
    save.mutate(patch, {
      onError: (e) => {
        setProblem(messageOf(e));
      },
    });
  }

  if (can.isError) return <ErrorState error={can.error} onRetry={() => void can.refetch()} />;
  if (can.data !== true) return null;
  return (
    <Card title="Job" actions={<SaveState pending={save.isPending} saved={save.isSuccess} problem={problem} />}>
      {project.isPending ? <LoadingState label="Loading the job" /> : null}
      {project.isError ? <ErrorState error={project.error} onRetry={() => void project.refetch()} /> : null}
      {/* Keyed on the job, not the version: my typing survives each autosave. */}
      {project.data ? <JobFields key={project.data.id} row={project.data} commit={commit} onProblem={setProblem} /> : null}
    </Card>
  );
}
