// e2e mock of a wall's details and the walls signed off before the app (0082), with the database's rules in short form:
// revs.manage only; details tidied (empty = none, too long refused), version-checked; sign-offs one live row per wall
// and item, items of the wall's list, an OFS number of 1 or more, a day not ahead, a changed number drops the old
// number's IR (0095); clear answers what it cleared. The
// rule that decides a cell (a newer in-app request wins) is signoffOf, used by mock/revRequests' status. State is
// mock/revs'.
import type { Tables } from '../database.types';
import { parseArea, WALL_DETAIL_MAX, type RevArea, type WallDetailKey, type WallDetails } from '../revs.types';
import type { SignoffRow } from '../revs.history';
import type { RevSignoff, SignoffValues } from '../revs.walls';
import { bump, checkVersion, clean, fail, has, must, newId, read, stamp, write, type RevMockState } from './revs';
import { delay } from './store';

const WHAT: Record<WallDetailKey, string> = {
  wall_tag: 'tag', rating: 'rating', ul_design: 'UL design', fire_area: 'fire area', sheet_ref: 'sheet', check_note: 'check note',
};

function tidy(key: WallDetailKey, v: string | null): string | null {
  const t = clean(v);
  if (t.length > WALL_DETAIL_MAX[key]) throw fail(`Keep the ${WHAT[key]} to ${String(WALL_DETAIL_MAX[key])} characters.`);
  return t === '' ? null : t;
}

export async function saveDetails(area: RevArea, details: WallDetails): Promise<RevArea> {
  await delay();
  must('revs.manage');
  const s = read();
  const current = s.areas.find((a) => a.id === area.id && a.deleted_at === null);
  if (!current) throw fail('This wall was removed.');
  checkVersion(current.version, area.version);
  const keys = Object.keys(WALL_DETAIL_MAX) as WallDetailKey[];
  const next = Object.fromEntries(keys.map((k) => [k, tidy(k, details[k])])) as WallDetails;
  if (keys.every((k) => next[k] === current[k])) return parseArea(current);
  const saved = bump(current, next);
  write((x) => ({ ...x, areas: x.areas.map((a) => (a.id === saved.id ? saved : a)) }));
  return parseArea(saved);
}

type Signoff = Tables<'rev_signoffs'>;

/** The wall, live, and the items: of its list, each once. */
function wallOf(s: RevMockState, areaId: string, itemIds: readonly string[]): Tables<'rev_areas'> {
  must('revs.manage');
  const area = s.areas.find((a) => a.id === areaId && a.deleted_at === null);
  if (!area) throw fail('That item no longer exists.', 'P0002');
  if (itemIds.length < 1 || new Set(itemIds).size !== itemIds.length) throw fail('Pick 1 to 200 items.');
  const ok = itemIds.every((id) => {
    const item = s.items.find((i) => i.id === id && i.deleted_at === null);
    return s.revs.find((r) => r.id === item?.rev_id && r.deleted_at === null)?.list_id === area.list_id;
  });
  if (!ok) throw fail("Pick items of this wall's list.");
  return area;
}

export async function setSignoff(areaId: string, itemIds: string[], v: SignoffValues): Promise<RevSignoff[]> {
  await delay();
  const s = read();
  const area = wallOf(s, areaId, itemIds);
  if (v.ofsNumber !== null && v.ofsNumber < 1) throw fail('Give the OFS IR number, 1 or more.');
  if (v.signedOn !== null && v.signedOn > new Date().toJSON().slice(0, 10)) throw fail('Pick the day it was signed off.');
  const note = clean(v.note) || null;
  if (note !== null && note.length > 300) throw fail('Keep the note to 300 characters.');
  const out: Signoff[] = itemIds.map((itemId) => {
    const live = s.signoffs.find((x) => x.area_id === areaId && x.item_id === itemId && x.deleted_at === null);
    const values = { ofs_number: v.ofsNumber, signed_on: v.signedOn, note };
    if (live) return bump(live, live.ofs_number === v.ofsNumber ? values : { ...values, file_id: null });
    return { ...stamp(), org_id: area.org_id, project_id: area.project_id, id: newId('mock-rev-signoff'), area_id: areaId, item_id: itemId, file_id: null, ...values };
  });
  const ids = new Set(out.map((x) => x.id));
  write((x) => ({ ...x, signoffs: [...x.signoffs.filter((r) => !ids.has(r.id)), ...out] }));
  return out;
}

export async function clearSignoff(areaId: string, itemIds: string[]): Promise<RevSignoff[]> {
  await delay();
  const s = read();
  wallOf(s, areaId, itemIds);
  const gone = s.signoffs
    .filter((x) => x.area_id === areaId && itemIds.includes(x.item_id) && x.deleted_at === null)
    .map((x) => bump(x, { deleted_at: new Date().toJSON() }));
  const ids = new Set(gone.map((x) => x.id));
  write((x) => ({ ...x, signoffs: [...x.signoffs.filter((r) => !ids.has(r.id)), ...gone] }));
  return gone;
}

/** rev_signoff_live: the live sign-off of a cell, unless an in-app request on it (of `asked`: when each was made) is
 *  newer: made after its day, or after it was last set when it has no day. */
export function signoffOf(s: RevMockState, areaId: string, itemId: string, asked: readonly string[]): Signoff | undefined {
  const live = s.signoffs.find((x) => x.area_id === areaId && x.item_id === itemId && x.deleted_at === null);
  if (!live) return undefined;
  const newer = asked.some((at) => (live.signed_on === null ? at > live.updated_at : at.slice(0, 10) > live.signed_on));
  return newer ? undefined : live;
}

/** rev_signoffs as revs.read reads them: the live ones of the job, what each says and its OFS IR when on file. */
export async function signoffs(projectId: string): Promise<SignoffRow[]> {
  await delay();
  if (!has('revs.read')) return [];
  return read().signoffs.flatMap((so) =>
    so.project_id === projectId && so.deleted_at === null
      ? [{ id: so.id, area_id: so.area_id, item_id: so.item_id, ofs_number: so.ofs_number, signed_on: so.signed_on, note: so.note, file_id: so.file_id }]
      : [],
  );
}
