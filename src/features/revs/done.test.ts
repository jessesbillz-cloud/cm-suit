import { describe, expect, it } from 'vitest';
import type { Rev, RevItem, RevStatusRow } from '../../data/revs.types';
import { allDone, doneText, lineDone, ofsList, roomDone, wallDone } from './done';
import type { ItemChip, ItemLine } from './itemLines';

const base = { project_id: 'job', version: 1, deleted_at: null };
const REV: Rev = { ...base, id: 'r0', list_id: 'l1', number: 0, name: 'TOW' };
const ITEM: RevItem = { ...base, id: 'i1', rev_id: 'r0', name: 'TOW - Speed Plugs', company: null, position: 1 };
const chip = (status: RevStatusRow['status'], ofsNumber: number | null = null): ItemChip => ({
  item: ITEM, status, short: 'Speed Plugs', ofsNumber, before: false, fileId: null,
});
const line = (...chips: ItemChip[]): ItemLine => ({ rev: REV, label: 'Rev 0 · TOW', chips });

describe('done', () => {
  it('a line is done when every item passed or is N/A, and it has one', () => {
    expect(lineDone(line(chip('passed', 40), chip('na')))).toBe(true);
    expect(lineDone(line(chip('na')))).toBe(true);
    expect(lineDone(line(chip('passed', 40), chip('requested')))).toBe(false);
    expect(lineDone(line(chip('passed', 40), chip('failed')))).toBe(false);
    expect(lineDone(line(chip('open')))).toBe(false);
    expect(lineDone(line())).toBe(false);
    expect(allDone([])).toBe(false);
  });

  it('a wall when every line is, a room when every wall is; nothing is never done', () => {
    const done = line(chip('passed', 40));
    const open = line(chip('open'));
    expect(wallDone([done, line(chip('na'))])).toBe(true);
    expect(wallDone([done, open])).toBe(false);
    expect(wallDone([])).toBe(false);
    expect(roomDone([{ done: true }, { done: true }])).toBe(true);
    expect(roomDone([{ done: true }, { done: false }])).toBe(false);
    expect(roomDone([])).toBe(false);
  });

  it('a done line says its OFS numbers: each once, in order, a short list or the last one and how many more', () => {
    expect(ofsList([chip('passed', 40)])).toBe('0040');
    expect(ofsList([chip('passed', 41), chip('passed', 38), chip('passed', 41)])).toBe('0038, 0041');
    expect(ofsList([chip('passed', 1), chip('passed', 2), chip('passed', 3)])).toBe('0001, 0002, 0003');
    expect(ofsList([chip('passed', 1), chip('passed', 2), chip('passed', 47), chip('passed', 9)])).toBe('0047 +3');
    expect(ofsList([chip('passed'), chip('na')])).toBeNull();
  });

  it('"Done · 0040", "Done" with no numbers, "N/A" when every item is', () => {
    expect(doneText([chip('passed', 40), chip('na')])).toBe('Done · 0040');
    expect(doneText([chip('passed')])).toBe('Done');
    expect(doneText([chip('na'), chip('na')])).toBe('N/A');
  });
});
