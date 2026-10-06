// Settings > Job, when Inspections is on: the GC approval step (off by default), OFS as a request type, and with OFS on
// the words a sub confirms before an OFS request goes (0091: empty is the standard wording, shown as the placeholder).
// Saved as I go, through the job's one settings schema (lib/settings) with the job's version check.
import { useState } from 'react';
import { messageOf } from '../../data/errors';
import { useOfsAttestText } from '../../data/inspections.ofs';
import { useSaveProject } from '../../data/jobs.mutations';
import type { ProjectWithSettings } from '../../data/queries';
import { CheckField, FIELD_AREA, FIELD_LABEL } from '../../ui/Fields';

type Key = 'ir_gc_approval' | 'ir_ofs_allowed';
type Value = boolean | string | null;

function asObject(v: unknown): Record<string, unknown> {
  return v !== null && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
}

export function InspectionSettings({ row }: { row: ProjectWithSettings }) {
  const save = useSaveProject(row.id);
  const [problem, setProblem] = useState<string | null>(null);
  const ofs = row.parsedSettings.ir_ofs_allowed;
  const standard = useOfsAttestText(row.id, ofs);
  const [wording, setWording] = useState(row.parsedSettings.ir_ofs_attest_text ?? '');

  function set(key: Key | 'ir_ofs_attest_text', value: Value) {
    setProblem(null);
    save.mutate(
      { settings: { ...asObject(row.settings), [key]: value } as ProjectWithSettings['settings'] },
      {
        onError: (e) => {
          setProblem(messageOf(e));
        },
      },
    );
  }

  return (
    <fieldset className="flex flex-col sm:col-span-2" data-testid="ir-settings">
      <legend className="mb-1 text-xs font-medium text-ink-2">Inspections</legend>
      <div className="flex flex-wrap gap-x-5">
        <CheckField
          label="GC approves requests"
          checked={row.parsedSettings.ir_gc_approval}
          onChange={(on) => {
            set('ir_gc_approval', on);
          }}
        />
        <CheckField
          label="OFS requests"
          checked={row.parsedSettings.ir_ofs_allowed}
          onChange={(on) => {
            set('ir_ofs_allowed', on);
          }}
        />
      </div>
      {ofs ? (
        <label className={`${FIELD_LABEL} mt-2`}>
          OFS attestation
          <textarea
            rows={3}
            maxLength={1000}
            className={FIELD_AREA}
            value={wording}
            placeholder={standard.data ?? ''}
            data-testid="ir-attest-setting"
            onChange={(e) => {
              setWording(e.target.value);
            }}
            onBlur={() => {
              const next = wording.trim() === '' ? null : wording.trim();
              if (next !== row.parsedSettings.ir_ofs_attest_text) set('ir_ofs_attest_text', next);
            }}
          />
        </label>
      ) : null}
      {standard.isError ? <p className="text-sm text-danger">{messageOf(standard.error)}</p> : null}
      {problem ? <p className="text-sm text-danger">{problem}</p> : null}
    </fieldset>
  );
}
