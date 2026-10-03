// e2e mock of walls on the plan (0059) with the database's rules in short form: a wall drawn and named (once per
// level; the same wall again comes back as it is; a wall of that name not on the plan yet is placed there), and a
// wall's place set at once with a version check (a null line takes it off the plan). State is mock/revs'.
import type { Tables } from '../database.types';
import { parseArea, wallLineSchema, type RevArea, type WallLine } from '../revs.types';
import { bump, checkVersion, clean, fail, listOf, must, newId, read, same, stamp, write } from './revs';
import { delay } from './store';

function checkPlace(sheetFileId: string | null, page: number, geom: WallLine | null): void {
  if (geom === null) return;
  if (sheetFileId === null) throw fail('Pick the sheet first.');
  if (page < 1 || page > 2000) throw fail('Pick a page of the sheet.');
  const ok = wallLineSchema.safeParse(geom).success && new Set(geom.map((p) => p.join(','))).size >= 2;
  if (!ok) throw fail('Draw the wall: 2 to 50 points on the sheet.');
}

const sameLine = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

export async function drawArea(v: {
  listId: string; level: string; name: string; sheetFileId: string | null; page: number; geom: WallLine;
}): Promise<RevArea> {
  await delay();
  must('revs.manage');
  const s = read();
  const l = listOf(s, v.listId);
  if (clean(v.level) === '') throw fail('Name the level.');
  if (clean(v.name) === '') throw fail('Name the wall.');
  checkPlace(v.sheetFileId, v.page, v.geom);
  const live = s.areas.filter((a) => a.list_id === l.id && a.deleted_at === null);
  const found = live.find((a) => same(a.level, v.level) && same(a.name, v.name));
  if (found) {
    if (found.sheet_file_id === v.sheetFileId && found.sheet_page === v.page && sameLine(found.geom, v.geom)) return parseArea(found);
    if (found.geom !== null) throw fail('That wall is already on this level.');
    const placed = bump(found, { sheet_file_id: v.sheetFileId, sheet_page: v.page, geom: v.geom });
    write((x) => ({ ...x, areas: x.areas.map((a) => (a.id === placed.id ? placed : a)) }));
    return parseArea(placed);
  }
  const row: Tables<'rev_areas'> = {
    ...stamp(), org_id: l.org_id, project_id: l.project_id, id: newId('mock-rev-area'), list_id: l.id, level: clean(v.level),
    name: clean(v.name), sheet_file_id: v.sheetFileId, sheet_page: v.page, geom: v.geom,
    position: Math.max(0, ...live.map((a) => a.position)) + 1,
  };
  write((x) => ({ ...x, areas: [...x.areas, row] }));
  return parseArea(row);
}

export async function placeArea(v: { area: RevArea; sheetFileId: string | null; page: number; geom: WallLine | null }): Promise<RevArea> {
  await delay();
  must('revs.manage');
  const s = read();
  const current = s.areas.find((a) => a.id === v.area.id && a.deleted_at === null);
  if (!current) throw fail('This wall was removed.');
  listOf(s, current.list_id);
  if (current.sheet_file_id === v.sheetFileId && current.sheet_page === v.page && sameLine(current.geom, v.geom)) return parseArea(current);
  checkVersion(current.version, v.area.version);
  checkPlace(v.sheetFileId, v.page, v.geom);
  const next = bump(current, { sheet_file_id: v.sheetFileId, sheet_page: v.page, geom: v.geom });
  write((x) => ({ ...x, areas: x.areas.map((a) => (a.id === next.id ? next : a)) }));
  return parseArea(next);
}
