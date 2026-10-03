import { describe, expect, it } from 'vitest';
import { sheetOptions, sheetToSend, wallSheets } from './mapSheets';

const wall = (level: string, sheet: string | null) => ({ level, sheet_file_id: sheet });

describe('the walls\' sheets a link visitor picks from', () => {
  it('one per sheet, labelled by the levels of its walls (Level 2 before Level 10), walls without a sheet left out', () => {
    const sheets = wallSheets([wall('Level 10', 's2'), wall(' Level 2 ', 's1'), wall('Level 2', 's2'), wall('Level 3', null)]);
    expect(sheets).toEqual([
      { file_id: 's2', label: 'Level 2, Level 10' },
      { file_id: 's1', label: 'Level 2' },
    ]);
  });

  it('as choices by label, a repeated label numbered so each one is a sheet', () => {
    expect(
      sheetOptions([
        { file_id: 'b', label: 'Level 10' },
        { file_id: 'c', label: 'Level 2' },
        { file_id: 'a', label: 'Level 2' },
      ]),
    ).toEqual([
      { value: 'a', label: 'Level 2' },
      { value: 'c', label: 'Level 2 (2)' },
      { value: 'b', label: 'Level 10' },
    ]);
    expect(sheetOptions([])).toEqual([]);
  });

  it('the request names a picked sheet only while one of its walls is on it (else the server takes the first wall\'s)', () => {
    const walls = [wall('Level 01', 's1'), wall('Level 02', 's2')];
    expect(sheetToSend(walls, 's2')).toBe('s2');
    expect(sheetToSend(walls, null)).toBeNull();
    // The wall on that sheet came off the request.
    expect(sheetToSend([wall('Level 01', 's1')], 's2')).toBeNull();
  });
});
