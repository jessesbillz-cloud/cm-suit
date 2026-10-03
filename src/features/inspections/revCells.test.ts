import { describe, expect, it } from 'vitest';
import type { IrRevItem, RevSetup } from '../../data/revs.types';
import { allPassed, cellChip, cellGroups, draftOf, draftToSave, leftToDo, oneLevel, savedResults, settle, type Edits } from './revCells';

const row = { project_id: 'job', version: 1, deleted_at: null };

const SETUP: RevSetup = {
  lists: [{ ...row, id: 'l1', name: 'Sample Walls', phase: null, permit_id: null, position: 1 }],
  revs: [{ ...row, id: 'r2', list_id: 'l1', number: 2, name: 'CJ' }],
  items: [
    { ...row, id: 'stuff', rev_id: 'r2', name: 'CJ Stuffing', company: null, position: 1 },
    { ...row, id: 'caulk', rev_id: 'r2', name: 'CJ Caulking', company: null, position: 2 },
  ],
  areas: [
    { ...row, id: 'b', list_id: 'l1', level: 'Level 02', name: 'Wall B', sheet_file_id: null, position: 2 },
    { ...row, id: 'a', list_id: 'l1', level: 'Level 02', name: 'Wall A', sheet_file_id: null, position: 1 },
    { ...row, id: 'z', list_id: 'l1', level: 'Level 10', name: 'Wall Z', sheet_file_id: null, position: 1 },
  ],
  marks: [],
};

function cell(area: string, item: string, color: number, result: string | null = null, note: string | null = null): IrRevItem {
  return { id: `${area}-${item}`, request_id: 'q', area_id: area, item_id: item, color, result, result_note: note, result_at: null, result_by: null, version: 1 };
}

const OPEN = [cell('b', 'caulk', 2), cell('b', 'stuff', 1), cell('a', 'stuff', 1)];

describe('the cells on screen', () => {
  it('groups by item color, walls by level then place', () => {
    const groups = cellGroups(OPEN, SETUP);
    expect(groups.map((g) => [g.color, g.item, g.rows.map((r) => r.label)])).toEqual([
      [1, 'CJ Stuffing', ['Wall A', 'Wall B']],
      [2, 'CJ Caulking', ['Wall B']],
    ]);
    expect(oneLevel(OPEN, SETUP)).toBe('Level 02');
  });
  it('names the level on each wall when the request spans levels', () => {
    const cells = [...OPEN, cell('z', 'stuff', 1)];
    expect(cellGroups(cells, SETUP)[0]?.rows.map((r) => r.label)).toEqual(['Level 02 · Wall A', 'Level 02 · Wall B', 'Level 10 · Wall Z']);
    expect(oneLevel(cells, SETUP)).toBeNull();
  });
  it('shows Passed and Failed in the status colors, nothing before a result', () => {
    expect(cellChip('passed')).toEqual({ status: 'approved', label: 'Passed' });
    expect(cellChip('failed')).toEqual({ status: 'not_approved', label: 'Failed' });
    expect(cellChip(null)).toBeNull();
  });
});

describe('the result draft', () => {
  it('saves only once every cell is set, and a failed one says why', () => {
    let edits: Edits = { 'b|caulk': { result: 'passed', note: '' }, 'b|stuff': { result: 'failed', note: ' ' } };
    expect(leftToDo(OPEN, edits)).toBe(2);
    expect(draftToSave(OPEN, edits)).toBeNull();
    edits = { ...edits, 'b|stuff': { result: 'failed', note: ' Gaps at the track ' }, 'a|stuff': { result: 'passed', note: '' } };
    expect(leftToDo(OPEN, edits)).toBe(0);
    expect(draftToSave(OPEN, edits)).toEqual([
      { area_id: 'b', item_id: 'caulk', result: 'passed', note: null },
      { area_id: 'b', item_id: 'stuff', result: 'failed', note: 'Gaps at the track' },
      { area_id: 'a', item_id: 'stuff', result: 'passed', note: null },
    ]);
  });
  it('sends nothing when the draft is what is saved', () => {
    const saved = [cell('b', 'caulk', 2, 'passed'), cell('b', 'stuff', 1, 'failed', 'Gaps'), cell('a', 'stuff', 1, 'passed')];
    expect(savedResults(saved)?.map((r) => r.result)).toEqual(['passed', 'failed', 'passed']);
    expect(draftToSave(saved, {})).toBeNull();
    expect(draftToSave(saved, { 'b|stuff': { result: 'passed', note: 'Gaps' } })?.[1]).toEqual({ area_id: 'b', item_id: 'stuff', result: 'passed', note: null });
    expect(savedResults(OPEN)).toBeNull();
  });
  it('passes everything in one tap', () => {
    expect(allPassed(OPEN).every((r) => r.result === 'passed' && r.note === null)).toBe(true);
    expect(allPassed(OPEN)).toHaveLength(3);
  });
  it('keeps changes made while a save was on its way', () => {
    const sent = allPassed(OPEN);
    const edits: Edits = { 'b|caulk': { result: 'passed', note: '' }, 'a|stuff': { result: 'failed', note: 'Typed meanwhile' } };
    expect(settle(edits, sent)).toEqual({ 'a|stuff': { result: 'failed', note: 'Typed meanwhile' } });
    expect(settle(edits, null)).toEqual({});
    expect(draftOf(OPEN[0] as IrRevItem, {})).toEqual({ result: null, note: '' });
  });
});
