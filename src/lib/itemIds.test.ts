import { describe, expect, it } from 'vitest';
import { NEW_ITEM, opensInMain, WALLS_ITEM } from './itemIds';

describe('opensInMain', () => {
  it('a Revs wall is a page of its own; its setup forms and every other item open in the right column', () => {
    expect(opensInMain('revs', 'mock-rev-area-1')).toBe(true);
    expect(opensInMain('revs', NEW_ITEM)).toBe(false);
    expect(opensInMain('revs', WALLS_ITEM)).toBe(false);
    expect(opensInMain('inspections', 'mock-ir-1')).toBe(false);
    expect(opensInMain('files', 'file-1')).toBe(false);
  });
});
