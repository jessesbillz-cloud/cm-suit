// Above the plan: the level (one button per level, MDR's Special-kinds layout), the level's sheets when its walls are on
// more than one, and for a manager the sheet of a level with no sheet yet; drawing, the page of a plan set and another
// sheet. A manager also starts a new level: "+ Level", its name, Enter.
import { useState } from 'react';
import { FileText, Plus } from 'lucide-react';
import { ChipPick } from '../../../ui/ChipPick';
import { Icon } from '../../../ui/Icon';
import { FIELD_CONTROL } from '../../../ui/Fields';
import { PagePicker } from '../../inspections/PagePicker';
import { SheetPicker } from '../SheetPicker';
import { targetKey, type PlanTarget } from './planGeom';

interface PlanControlsProps {
  projectId: string;
  /** None: the level is fixed (a wall being placed); no level buttons. */
  levels: readonly string[];
  level: string | null;
  onLevel: (level: string) => void;
  targets: readonly PlanTarget[];
  target: PlanTarget | null;
  onTarget: (t: PlanTarget) => void;
  /** Sheet names by file id (the job's PDFs I can read); a sheet without one is "Sheet 2". */
  names: ReadonlyMap<string, string>;
  /** A manager may add a level and pick the sheet. */
  canManage: boolean;
  /** A manager drawing: the page of a plan set, and another sheet on a tap. */
  drawing: boolean;
  /** The open PDF's page count. */
  pages: number;
}

function NewLevel({ onLevel }: { onLevel: (level: string) => void }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  if (!open) {
    return (
      <button
        type="button"
        className="inline-flex min-h-11 items-center gap-1 rounded-lg border border-dashed border-line-strong px-3 text-sm font-medium text-ink-2 hover:border-ink-3 hover:text-ink sm:min-h-9"
        data-testid="plan-new-level"
        onClick={() => {
          setOpen(true);
        }}
      >
        <Icon icon={Plus} size={15} />
        Level
      </button>
    );
  }
  return (
    <form
      className="flex"
      onSubmit={(e) => {
        e.preventDefault();
        if (name.trim() === '') return;
        onLevel(name.trim());
        setOpen(false);
        setName('');
      }}
    >
      <input
        aria-label="New level"
        className={`${FIELD_CONTROL} w-36`}
        value={name}
        maxLength={40}
        autoFocus
        placeholder="Level 03"
        data-testid="plan-new-level-name"
        onChange={(e) => {
          setName(e.target.value);
        }}
        onBlur={() => {
          if (name.trim() === '') setOpen(false);
        }}
      />
    </form>
  );
}

interface SheetToolsProps {
  projectId: string;
  target: PlanTarget | null;
  onTarget: (t: PlanTarget) => void;
  pages: number;
}

/** No sheet yet: the picker. Drawing on one: its page (a plan set) and Sheet, which opens the picker for another. */
function SheetTools({ projectId, target, onTarget, pages }: SheetToolsProps) {
  const [changing, setChanging] = useState(false);
  const picker = (
    <SheetPicker
      projectId={projectId}
      value={target?.fileId ?? null}
      onChange={(fileId) => {
        setChanging(false);
        if (fileId !== null) onTarget({ fileId, page: 1 });
      }}
    />
  );
  if (target === null || changing) return picker;
  return (
    <div className="flex flex-wrap items-center gap-2">
      {pages > 1 ? (
        <PagePicker
          page={target.page}
          pages={pages}
          onPage={(page) => {
            onTarget({ fileId: target.fileId, page });
          }}
        />
      ) : null}
      <button
        type="button"
        className="inline-flex min-h-11 items-center gap-1.5 rounded-lg px-2 text-sm font-medium text-accent hover:bg-accent-soft sm:min-h-9"
        data-testid="plan-other-sheet"
        onClick={() => {
          setChanging(true);
        }}
      >
        <Icon icon={FileText} size={15} />
        Sheet
      </button>
    </div>
  );
}

function targetLabel(t: PlanTarget, i: number, names: ReadonlyMap<string, string>): string {
  const name = (names.get(t.fileId) ?? `Sheet ${String(i + 1)}`).replace(/\.pdf$/i, '');
  return t.page > 1 ? `${name} · p. ${String(t.page)}` : name;
}

export function PlanControls(p: PlanControlsProps) {
  const levelChips = p.levels.map((l) => ({ value: l, label: l }));
  return (
    <div className="flex flex-col gap-2.5">
      {levelChips.length > 0 || (p.canManage && !p.drawing) ? (
        <div className="flex flex-wrap items-center gap-1.5">
          {levelChips.length > 0 ? (
            <ChipPick
              label="Level"
              chips={levelChips}
              picked={p.level ? [p.level] : []}
              onChange={(picked) => {
                if (picked[0]) p.onLevel(picked[0]);
              }}
              testId="plan-level"
            />
          ) : null}
          {p.canManage && !p.drawing ? <NewLevel onLevel={p.onLevel} /> : null}
        </div>
      ) : null}
      {p.targets.length > 1 ? (
        <ChipPick
          label="Sheet"
          chips={p.targets.map((t, i) => ({ value: targetKey(t), label: targetLabel(t, i, p.names) }))}
          picked={p.target ? [targetKey(p.target)] : []}
          onChange={(picked) => {
            const t = p.targets.find((x) => targetKey(x) === picked[0]);
            if (t) p.onTarget(t);
          }}
          testId="plan-sheet-pick"
        />
      ) : null}
      {p.canManage && p.level !== null && (p.target === null || p.drawing) ? (
        <SheetTools key={p.level} projectId={p.projectId} target={p.target} onTarget={p.onTarget} pages={p.pages} />
      ) : null}
    </div>
  );
}
