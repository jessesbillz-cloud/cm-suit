// What a wall photo says under it (0102): when and who, the wall it is of when the list holds several walls, the request
// it was added on, and its note. Pure, so it is tested without a screen.
import { formatInZone } from '../../../lib/dates';
import type { RevPhoto } from '../../../data/revs.photos';

/** "Oct 12, 3:04 PM · Sam Sub", in the job's time zone. */
export function photoWhen(p: Pick<RevPhoto, 'created_at' | 'by_name'>, timeZone: string): string {
  return `${formatInZone(p.created_at, timeZone, 'MMM d, h:mm a')} · ${p.by_name}`;
}

/** "IR 12" for a photo added on a request, else null. */
export function photoRequest(p: Pick<RevPhoto, 'request_id' | 'ir_number'>): string | null {
  return p.request_id === null || p.ir_number === null ? null : `IR ${String(p.ir_number)}`;
}

/** The wall's name when the list is a room's or a request's ("Room" for the room's own), else null. */
export function photoWall(p: Pick<RevPhoto, 'area_id'>, names: ReadonlyMap<string, string> | null): string | null {
  if (names === null) return null;
  return p.area_id === null ? 'Room' : (names.get(p.area_id) ?? null);
}
