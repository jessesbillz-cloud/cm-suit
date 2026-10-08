// A manager's two small forms on a room's page (0083): the room's number and name (Setup's EditForm), and Add wall: a
// wall of the room's list on its level not in it yet (Jesse, Oct 6: not every wall of the job), added as soon as it is
// picked, with Undo in the toast.
import { useState } from 'react';
import type { RevRoom } from '../../../data/revs.rooms';
import type { RevArea, RevSetup } from '../../../data/revs.types';
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
  if (choices.length === 0) return null;
  return (
    <select
      aria-label="Add a wall"
      className={`${FIELD_CONTROL} min-w-0 max-w-[16rem]`}
      value=""
      disabled={busy}
      data-testid="rev-room-add-pick"
      onChange={(e) => {
        const area = choices.find((a) => a.id === e.target.value);
        if (area) onAdd(area);
      }}
    >
      <option value="">Add wall</option>
      {choices.map((a) => (
        <option key={a.id} value={a.id}>
          {a.wall_tag ? `${a.wall_tag} · ${a.name}` : a.name}
        </option>
      ))}
    </select>
  );
}
