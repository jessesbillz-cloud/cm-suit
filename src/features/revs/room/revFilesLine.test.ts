import { describe, expect, it } from 'vitest';
import { addedLine, linkedLine } from './revFilesLine';

const pic = (name: string, rooms = 1) => ({ name, rooms, signoffs: 0 });
const ir = (name: string, signoffs = 2) => ({ name, rooms: 0, signoffs });

describe('linkedLine', () => {
  it('says what Link files linked, or that nothing was new', () => {
    expect(linkedLine({ images: 1, files: 0, sheets: 0 })).toBe('1 picture linked.');
    expect(linkedLine({ images: 1, files: 1, sheets: 0 })).toBe('1 picture and 1 IR linked.');
    expect(linkedLine({ images: 20, files: 31, sheets: 51 })).toBe('20 pictures, 31 IRs and 51 sheets linked.');
    expect(linkedLine({ images: 0, files: 0, sheets: 6 })).toBe('6 sheets linked.');
    expect(linkedLine({ images: 0, files: 0, sheets: 0 })).toBe('Nothing new to link.');
  });
});

describe('addedLine', () => {
  it('counts the files that linked and names the ones that matched nothing', () => {
    expect(addedLine([pic('a.png'), pic('b.png', 2)])).toBe('2 pictures linked.');
    expect(addedLine([pic('a.png'), ir('OFS_IR_0041.pdf'), pic('x.png', 0)])).toBe('1 picture and 1 IR linked. Not matched: x.png.');
    expect(addedLine([pic('x.png', 0), ir('y.pdf', 0)])).toBe('Nothing linked. Not matched: x.png and y.pdf.');
  });

  it('lists five names at most', () => {
    const missed = ['1', '2', '3', '4', '5', '6', '7'].map((n) => pic(`${n}.png`, 0));
    expect(addedLine(missed)).toBe('Nothing linked. Not matched: 1.png, 2.png, 3.png, 4.png, 5.png and 2 more.');
  });
});
