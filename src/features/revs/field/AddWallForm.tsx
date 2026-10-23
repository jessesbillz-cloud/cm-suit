// Add a wall on the spot (0113; Jesse, Oct 23: "I'm standing at this wall and you guys don't have it laid out for me -
// so here it is: wall in room 302, the north wall - and boom, up comes the 3-D model"): the card (when the job has
// more than one), the level, the room (one of the level's, or a new number and name), which wall (North, South, East,
// West, or Other with a short name), and its tag and rating when known. A tag another wall of the job has shows what
// it brings (rating, UL, sheet), the database fills them in. Save opens the new wall's page at once.
import { useState } from 'react';
import { Plus } from 'lucide-react';
import { messageOf } from '../../../data/errors';
import { useAddFieldWall, type WallSide } from '../../../data/revs.field';
import type { RevRoom, RevRooms } from '../../../data/revs.rooms';
import { wallFacts, type RevSetup } from '../../../data/revs.types';
import { Button } from '../../../ui/Button';
import { ChipPick } from '../../../ui/ChipPick';
import { TextField } from '../../../ui/Fields';
import { roomLabel } from '../rooms';
import { jobLevels } from '../levels';
import { jobTags, roomsOn, SIDES, tagSource } from './fieldWall';

const NEW_ROOM = 'new';
const NEW_LEVEL = 'new-level';
const HEAD = 'heading text-[12.5px] font-semibold uppercase tracking-[0.06em] text-ink-2';

interface AddWallFormProps {
  projectId: string;
  setup: RevSetup;
  rooms: RevRooms;
  /** Opened from a room's page: that room. */
  room: RevRoom | null;
  /** The level picked on the cards. */
  level: string | null;
  onAdded: (areaId: string, roomId: string) => void;
}

export function AddWallForm({ projectId, setup, rooms, room, level, onAdded }: AddWallFormProps) {
  const add = useAddFieldWall();
  const [listId, setListId] = useState(room?.list_id ?? setup.lists[0]?.id ?? '');
  const levels = jobLevels([...setup.areas.filter((a) => a.list_id === listId), ...rooms.rooms.filter((r) => r.list_id === listId)]);
  const [lvl, setLvl] = useState(room?.level ?? level ?? levels[0] ?? '');
  const [roomId, setRoomId] = useState<string>(room?.id ?? NEW_ROOM);
  const [number, setNumber] = useState('');
  const [roomName, setRoomName] = useState('');
  const [side, setSide] = useState<WallSide | null>(null);
  const [name, setName] = useState('');
  const [tag, setTag] = useState('');
  const [rating, setRating] = useState('');
  const onLevel = roomsOn(rooms.rooms, listId, lvl);
  const src = tagSource(setup.areas, tag);
  const isNew = roomId === NEW_ROOM;
  const ready = side !== null && lvl.trim() !== '' && (!isNew || number.trim() !== '') && (side !== 'other' || name.trim() !== '');

  return (
    <form
      className="flex flex-col gap-4"
      data-testid="field-wall-form"
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        if (side === null || !ready) return;
        add.mutate(
          { projectId, listId, roomId: isNew ? null : roomId, level: lvl, roomNumber: number, roomName, side, name, wallTag: tag, rating },
          { onSuccess: (r) => { onAdded(r.area_id, r.room_id); } },
        );
      }}
    >
      {room === null ? (
        <>
          {setup.lists.length > 1 ? (
            <div className="flex flex-col gap-1.5">
              <span className={HEAD}>Card</span>
              <ChipPick label="Card" chips={setup.lists.map((l) => ({ value: l.id, label: l.name }))} picked={[listId]} testId="field-list"
                onChange={(p) => { if (p[0]) setListId(p[0]); }} />
            </div>
          ) : null}
          <div className="flex flex-col gap-1.5">
            <span className={HEAD}>Level</span>
            <ChipPick
              label="Level"
              chips={[...levels.map((l) => ({ value: l, label: l })), { value: NEW_LEVEL, label: 'New level' }]}
              picked={[levels.includes(lvl) ? lvl : NEW_LEVEL]}
              testId="field-level"
              onChange={(p) => {
                const next = p[0];
                if (next === undefined) return;
                setLvl(next === NEW_LEVEL ? '' : next);
                setRoomId(NEW_ROOM);
              }}
            />
            {levels.includes(lvl) ? null : <TextField label="New level" value={lvl} onChange={setLvl} testId="field-level-new" large />}
          </div>
          <div className="flex flex-col gap-1.5">
            <span className={HEAD}>Room</span>
            <ChipPick
              label="Room"
              chips={[...onLevel.map((r) => ({ value: r.id, label: roomLabel(r) })), { value: NEW_ROOM, label: 'New room' }]}
              picked={[roomId]}
              testId="field-room"
              onChange={(p) => { setRoomId(p[0] ?? NEW_ROOM); }}
            />
            {isNew ? (
              <div className="grid grid-cols-2 gap-3">
                <TextField label="Number" value={number} onChange={setNumber} maxLength={20} testId="field-room-number" large />
                <TextField label="Name" value={roomName} onChange={setRoomName} maxLength={120} testId="field-room-name" large />
              </div>
            ) : null}
          </div>
        </>
      ) : (
        <p className="text-[15px] font-semibold text-ink" data-testid="field-room-fixed">{`${room.level.trim()} · ${roomLabel(room)}`}</p>
      )}
      <div className="flex flex-col gap-1.5">
        <span className={HEAD}>Wall</span>
        <ChipPick label="Wall" chips={SIDES.map((s) => ({ value: s.value, label: s.label }))} picked={side ? [side] : []} testId="field-side"
          onChange={(p) => { setSide(p[0] ?? null); }} />
        {side === 'other' ? <TextField label="Name" value={name} onChange={setName} maxLength={60} testId="field-name" large /> : null}
      </div>
      <div className="grid grid-cols-2 gap-3">
        <label className="flex flex-col gap-1.5 text-[13px] font-medium text-ink">
          Tag
          <input
            className="h-12 rounded-md border-[1.5px] border-line-strong bg-card px-3 text-base text-ink shadow-control"
            list="field-tags"
            value={tag}
            maxLength={20}
            data-testid="field-tag"
            onChange={(e) => { setTag(e.target.value); }}
          />
          <datalist id="field-tags">
            {jobTags(setup.areas).map((t) => <option key={t} value={t} />)}
          </datalist>
        </label>
        <TextField label="Rating" value={rating} onChange={setRating} maxLength={80} testId="field-rating" large />
      </div>
      {src ? <p className="text-[13px] font-medium text-ink-2" data-testid="field-tag-brings">{wallFacts({ ...src, rating: rating.trim() || src.rating })}</p> : null}
      {add.isError ? <p className="text-sm text-danger" data-testid="field-error">{messageOf(add.error)}</p> : null}
      <Button type="submit" variant="primary" size="lg" icon={Plus} loading={add.isPending} disabled={!ready} className="w-full sm:w-auto sm:self-start" data-testid="field-save">
        Add wall
      </Button>
    </form>
  );
}
