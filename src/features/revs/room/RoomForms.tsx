// A manager's two small forms on a room's page (0083): the room's number and name (Setup's EditForm), and Add wall: a
// wall of the room's list not in it yet (its level's first), added at once with Undo in the toast.
import { useState } from 'react';
import { Plus } from 'lucide-react';
import type { RevRoom } from '../../../data/revs.rooms';
import type { RevArea, RevSetup } from '../../../data/revs.types';
import { Button } from '../../../ui/Button';
import { FIELD_CONTROL, TextField } from '../../../ui/Fields';
import { wallsToAdd, type RoomWall } from '../rooms';
import { EditForm } from '../SetupForms';

interface RoomFormProps {
  room: RevRoom;
  onSave: (number: string, name: string) => Promise<boolean>;
  onCancel: () => void;
}

export function RoomForm({ room, onSave, onCancel }: RoomFormProps) {
  const [number, setNumber] = useState(room.number);
  const [name, setName] = useState(room.name);
  return (
    <EditForm ready={number.trim() !== '' && name.trim() !== ''} testId="rev-room-form" onSave={() => onSave(number, name)} onCancel={onCancel}>
      <div className="grid grid-cols-[7rem_minmax(0,1fr)] gap-3">
        <TextField label="Number" value={number} onChange={setNumber} maxLength={20} autoFocus testId="rev-room-number" />
        <TextField label="Name" value={name} onChange={setName} maxLength={120} testId="rev-room-name-input" />
      </div>
    </EditForm>
  );
}

interface AddRoomWallProps {
  setup: RevSetup;
  room: RevRoom;
  walls: readonly RoomWall[];
  busy: boolean;
  onAdd: (area: RevArea) => void;
}

export function AddRoomWall({ setup, room, walls, busy, onAdd }: AddRoomWallProps) {
  const choices = wallsToAdd(setup, room, walls);
  const [picked, setPicked] = useState('');
  const area = choices.find((a) => a.id === picked) ?? null;
  if (choices.length === 0) return null;
  return (
    <span className="flex min-w-0 items-center gap-2">
      <select
        aria-label="Wall to add"
        className={`${FIELD_CONTROL} min-w-0 max-w-[16rem]`}
        value={picked}
        data-testid="rev-room-add-pick"
        onChange={(e) => {
          setPicked(e.target.value);
        }}
      >
        <option value="">Add wall</option>
        {choices.map((a) => (
          <option key={a.id} value={a.id}>
            {`${a.level.trim()} · ${a.name}`}
          </option>
        ))}
      </select>
      <Button
        icon={Plus}
        aria-label="Add the wall"
        title="Add"
        disabled={busy || area === null}
        data-testid="rev-room-add"
        onClick={() => {
          if (!area) return;
          onAdd(area);
          setPicked('');
        }}
      />
    </span>
  );
}
