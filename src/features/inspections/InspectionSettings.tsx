// Settings > Job, when Inspections is on: the GC approval step (off by default) and OFS as a request type.
// Saved as I go, through the job's one settings schema (lib/settings) with the job's version check.
import { useState } from 'react';
import { messageOf } from '../../data/errors';
import { useSaveProject } from '../../data/jobs.mutations';
import type { ProjectWithSettings } from '../../data/queries';
import { CheckField } from '../../ui/Fields';

type Key = 'ir_gc_approval' | 'ir_ofs_allowed';

function asObject(v: unknown): Record<string, unknown> {
  return v !== null && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
}

export function InspectionSettings({ row }: { row: ProjectWithSettings }) {
  const save = useSaveProject(row.id);
  const [problem, setProblem] = useState<string | null>(null);

  function set(key: Key, on: boolean) {
    setProblem(null);
    save.mutate(
      { settings: { ...asObject(row.settings), [key]: on } as ProjectWithSettings['settings'] },
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
      {problem ? <p className="text-sm text-danger">{problem}</p> : null}
    </fieldset>
  );
}
