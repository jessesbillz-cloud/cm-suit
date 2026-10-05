// A manager's moves on a wall's own page: Edit (its name, level and sheet, the Setup form) and Remove, each with Undo
// (useSetupActions). Removing goes back to Revs; Undo brings the wall back.
import { useState } from 'react';
import { Pencil, Trash2 } from 'lucide-react';
import type { RevArea, RevSetup } from '../../data/revs.types';
import { Button } from '../../ui/Button';
import { levelsOf } from './model';
import { useSetupActions } from './useSetupActions';
import { WallForm } from './WallsSetup';

interface WallManageProps {
  projectId: string;
  area: RevArea;
  setup: RevSetup;
  isPhone: boolean;
  onRemoved: () => void;
}

/** The two buttons beside the name. */
function WallManageButtons({ busy, isPhone, onEdit, onRemove }: { busy: boolean; isPhone: boolean; onEdit: () => void; onRemove: () => void }) {
  const size = isPhone ? 'md' : 'sm';
  return (
    <span className="flex shrink-0 items-center">
      <Button size={size} variant="quiet" icon={Pencil} aria-label="Edit the wall" title="Edit" disabled={busy} data-testid="rev-wall-edit" onClick={onEdit} />
      <Button size={size} variant="quiet" icon={Trash2} aria-label="Remove the wall" title="Remove" disabled={busy} data-testid="rev-wall-remove" onClick={onRemove} />
    </span>
  );
}

export function useWallManage({ projectId, area, setup, isPhone, onRemoved }: WallManageProps) {
  const actions = useSetupActions(projectId);
  const [editing, setEditing] = useState(false);
  const levels = levelsOf(setup, area.list_id).map((g) => g.level);
  const buttons = (
    <WallManageButtons
      busy={actions.busy}
      isPhone={isPhone}
      onEdit={() => { setEditing(true); }}
      onRemove={() => {
        void actions.remove('area', area, area.name).then((gone) => {
          if (gone) onRemoved();
        });
      }}
    />
  );
  const form = editing ? (
    <WallForm area={area} levels={levels} onSave={(v) => actions.wall(area, v)} onCancel={() => { setEditing(false); }} />
  ) : null;
  return { buttons, form };
}
