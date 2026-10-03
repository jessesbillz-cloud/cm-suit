// The sheet a link visitor's map is drawn on: one of the request's walls' sheets (a visitor never browses the job's
// files), labelled by the walls' levels as the server labels them (link_request_map_sheets). Two sheets with the same
// levels get a number, so each label is one sheet. Pure; tested in mapSheets.test.ts.

interface WallSheet {
  file_id: string;
  label: string;
}

interface SheetWall {
  level: string;
  sheet_file_id: string | null;
}

/** Level 2 before Level 10. */
function natural(a: string, b: string): number {
  return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
}

/** The walls' sheets, each labelled by the levels of the walls on it. Walls without a sheet are left out. */
export function wallSheets(walls: readonly SheetWall[]): WallSheet[] {
  const levels = new Map<string, Set<string>>();
  for (const w of walls) {
    if (w.sheet_file_id === null) continue;
    const set = levels.get(w.sheet_file_id) ?? new Set<string>();
    set.add(w.level.trim());
    levels.set(w.sheet_file_id, set);
  }
  return [...levels.entries()].map(([file_id, set]) => ({ file_id, label: [...set].sort(natural).join(', ') }));
}

/** The sheets as choices, by label; a repeated label gets " (2)", " (3)" in order. */
export function sheetOptions(sheets: readonly WallSheet[]): { value: string; label: string }[] {
  const sorted = [...sheets].sort((a, b) => natural(a.label, b.label) || a.file_id.localeCompare(b.file_id));
  const seen = new Map<string, number>();
  return sorted.map((s) => {
    const n = (seen.get(s.label) ?? 0) + 1;
    seen.set(s.label, n);
    return { value: s.file_id, label: n === 1 ? s.label : `${s.label} (${String(n)})` };
  });
}

/** The sheet a request names: the one picked while one of its walls is on it, else none (the server takes the first
 *  wall's). */
export function sheetToSend(walls: readonly SheetWall[], picked: string | null): string | null {
  return picked !== null && walls.some((a) => a.sheet_file_id === picked) ? picked : null;
}
