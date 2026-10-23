// e2e mock of Back from OFS's failed items (0109 ofs_desk): each wall x item whose last result failed and that is not
// asked for again or passed since, on a request the reader may list there; its line names the room, wall, item and why.
import type { DeskRow } from '../ofs.types';
import type { IrRequest } from '../inspections.types';
import { status } from './revRequests';
import { has, read as readRevs } from './revs';
import { read as readRooms } from './revRooms';

export async function failedRows(projectId: string, requests: readonly IrRequest[]): Promise<DeskRow[]> {
  if (!has('revs.read')) return [];
  const byId = new Map(requests.map((r) => [r.id, r]));
  const s = readRevs();
  const rooms = readRooms();
  const roomOf = (areaId: string) => {
    const w = rooms.walls.find((x) => x.area_id === areaId && x.deleted_at === null);
    const r = rooms.rooms.find((x) => x.id === w?.room_id && x.deleted_at === null);
    return r === undefined ? null : r.kind === 'room' ? `${r.number} ${r.name}` : r.name;
  };
  return (await status(projectId)).flatMap((c): DeskRow[] => {
    const q = c.request_id === null ? undefined : byId.get(c.request_id);
    if (c.status !== 'failed' || q === undefined) return [];
    const parts = [roomOf(c.area_id), s.areas.find((a) => a.id === c.area_id)?.name, s.items.find((i) => i.id === c.item_id)?.name];
    const title = parts.filter((p): p is string => typeof p === 'string' && p !== '').join(' · ') + (c.note ? `: ${c.note}` : '');
    return [{
      id: `${c.area_id}:${c.item_id}`, kind: 'inspection', target_type: 'inspection_request', target_id: q.id,
      number: q.ofs_number ?? null, title: title.slice(0, 200), state: 'failed', at: c.at ?? q.result_at ?? q.created_at,
    }];
  });
}
