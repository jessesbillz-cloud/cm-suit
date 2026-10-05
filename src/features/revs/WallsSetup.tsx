// A list's walls in Setup, by level: each wall with its tag and plan sheet, moved up or down on its level, edited in
// place (name, level: a new level moves it there, sheet, and its details: tag, rating, UL design, fire area, sheet
// number, what to check) or removed, each with Undo.
import { useState } from 'react';
import { FileText } from 'lucide-react';
import { useRevSheets } from '../../data/revSheets.queries';
import { ErrorState } from '../../ui/States';
import { WALL_DETAIL_MAX, type RevArea, type RevSetup, type WallDetailKey, type WallDetails } from '../../data/revs.types';
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

/** The details' fields, in the order they read: label, and the test id's end. */
const DETAIL_FIELDS: [WallDetailKey, string, string][] = [
  ['wall_tag', 'Tag', 'tag'],
  ['rating', 'Rating', 'rating'],
  ['ul_design', 'UL design', 'ul'],
  ['fire_area', 'Fire area', 'fire-area'],
  ['sheet_ref', 'Sheet', 'sheet-ref'],
];

type DetailText = Record<WallDetailKey, string>;

const textOf = (area: RevArea): DetailText => ({
  wall_tag: area.wall_tag ?? '', rating: area.rating ?? '', ul_design: area.ul_design ?? '', fire_area: area.fire_area ?? '',
  sheet_ref: area.sheet_ref ?? '', check_note: area.check_note ?? '',
});

function detailsOf(t: DetailText): WallDetails {
  const v = (s: string) => (s.trim() === '' ? null : s.trim());
  return { wall_tag: v(t.wall_tag), rating: v(t.rating), ul_design: v(t.ul_design), fire_area: v(t.fire_area), sheet_ref: v(t.sheet_ref), check_note: v(t.check_note) };
}

/** A wall's name, level, sheet and details (Setup, and the wall's own page). */
export function WallForm({ area, levels, onSave, onCancel }: WallFormProps) {
  const [v, setV] = useState<Omit<WallValues, 'details'>>({ level: area.level, name: area.name, sheetFileId: area.sheet_file_id });
  const [d, setD] = useState<DetailText>(() => textOf(area));
  return (
    <EditForm
      ready={v.name.trim() !== '' && v.level.trim() !== ''}
      testId="rev-wall-form"
      onSave={() => onSave({ ...v, details: detailsOf(d) })}
      onCancel={onCancel}
    >
      <TextField label="Wall" value={v.name} onChange={(name) => { setV({ ...v, name }); }} autoFocus maxLength={160} testId="rev-wall-name-input" />
      <LevelField value={v.level} levels={levels} onChange={(level) => { setV({ ...v, level }); }} />
      <SheetPicker projectId={area.project_id} value={v.sheetFileId} onChange={(sheetFileId) => { setV({ ...v, sheetFileId }); }} clearable />
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        {DETAIL_FIELDS.map(([key, label, id]) => (
          <TextField
            key={key}
            label={label}
            value={d[key]}
            onChange={(text) => { setD({ ...d, [key]: text }); }}
            maxLength={WALL_DETAIL_MAX[key]}
            testId={`rev-wall-${id}-input`}
          />
        ))}
      </div>
      <TextField label="Check" value={d.check_note} onChange={(check_note) => { setD({ ...d, check_note }); }} maxLength={WALL_DETAIL_MAX.check_note} testId="rev-wall-check-input" />
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
      {sheets.isError ? <ErrorState className="m-0" error={sheets.error} title="The sheet names did not load." onRetry={() => void sheets.refetch()} /> : null}
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
                    onUp={i > 0 ? () => { actions.move('area', a, a.name, -1); } : undefined}
                    onDown={i < g.areas.length - 1 ? () => { actions.move('area', a, a.name, 1); } : undefined}
                    onEdit={() => { setEditing(a.id); }}
                    onRemove={() => { void actions.remove('area', a, a.name); }}
                  >
                    <span className="block">
                      {a.wall_tag ? <span className="mr-1.5 font-semibold text-ink-2">{a.wall_tag}</span> : null}
                      {a.name}
                    </span>
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
