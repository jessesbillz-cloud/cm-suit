// A list's walls in Setup, by level: each wall with its plan sheet, moved up or down on its level, edited in place
// (name, level: a new level moves it there, sheet) or removed, each with Undo.
import { useState } from 'react';
import { FileText } from 'lucide-react';
import { useRevSheets } from '../../data/revSheets.queries';
import type { RevArea, RevSetup } from '../../data/revs.types';
import { TextField } from '../../ui/Fields';
import { Icon } from '../../ui/Icon';
import { levelsOf } from './model';
import { EditForm, LevelField } from './SetupForms';
import { SetupRow } from './SetupRow';
import { SheetPicker } from './SheetPicker';
import type { useSetupActions, WallValues } from './useSetupActions';

type Actions = ReturnType<typeof useSetupActions>;

interface WallFormProps {
  area: RevArea;
  levels: readonly string[];
  onSave: (v: WallValues) => Promise<boolean>;
  onCancel: () => void;
}

function WallForm({ area, levels, onSave, onCancel }: WallFormProps) {
  const [v, setV] = useState<WallValues>({ level: area.level, name: area.name, sheetFileId: area.sheet_file_id });
  return (
    <EditForm ready={v.name.trim() !== '' && v.level.trim() !== ''} testId="rev-wall-form" onSave={() => onSave(v)} onCancel={onCancel}>
      <TextField label="Wall" value={v.name} onChange={(name) => { setV({ ...v, name }); }} autoFocus maxLength={160} testId="rev-wall-name-input" />
      <LevelField value={v.level} levels={levels} onChange={(level) => { setV({ ...v, level }); }} />
      <SheetPicker projectId={area.project_id} value={v.sheetFileId} onChange={(sheetFileId) => { setV({ ...v, sheetFileId }); }} clearable />
    </EditForm>
  );
}

interface WallsSetupProps {
  projectId: string;
  setup: RevSetup;
  listId: string;
  actions: Actions;
  isPhone: boolean;
}

export function WallsSetup({ projectId, setup, listId, actions, isPhone }: WallsSetupProps) {
  const [editing, setEditing] = useState<string | null>(null);
  const sheets = useRevSheets(projectId);
  const groups = levelsOf(setup, listId);
  const levels = groups.map((g) => g.level);
  const sheetName = (id: string | null) => (id === null ? null : (sheets.data?.find((s) => s.id === id)?.name ?? null));
  if (groups.length === 0) return <p className="py-2 text-[13px] text-ink-3">No walls yet.</p>;
  return (
    <div className="flex flex-col gap-2">
      {groups.map((g) => (
        <section key={g.level} className="flex flex-col">
          <h4 className="pt-1 text-[12px] font-semibold leading-5 text-ink-2">{g.level}</h4>
          <ul className="divide-y divide-line">
            {g.areas.map((a, i) => (
              <li key={a.id} data-testid={`rev-setup-wall-${a.id}`}>
                {editing === a.id ? (
                  <WallForm area={a} levels={levels} onSave={(v) => actions.wall(a, v)} onCancel={() => { setEditing(null); }} />
                ) : (
                  <SetupRow
                    name={a.name}
                    isPhone={isPhone}
                    disabled={actions.busy}
                    onUp={i > 0 ? () => { actions.moveWall(g.areas, a, -1); } : undefined}
                    onDown={i < g.areas.length - 1 ? () => { actions.moveWall(g.areas, a, 1); } : undefined}
                    onEdit={() => { setEditing(a.id); }}
                    onRemove={() => { actions.remove('area', a, a.name); }}
                  >
                    <span className="block">{a.name}</span>
                    {sheetName(a.sheet_file_id) ? (
                      <span className="flex items-start gap-1 text-[12.5px] leading-5 text-ink-3">
                        <Icon icon={FileText} size={13} className="mt-[3px] shrink-0" />
                        <span className="min-w-0 break-words">{sheetName(a.sheet_file_id)}</span>
                      </span>
                    ) : null}
                  </SetupRow>
                )}
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
