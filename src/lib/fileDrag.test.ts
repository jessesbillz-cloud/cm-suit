import { describe, expect, it } from 'vitest';
import { carriesFiles } from './fileDrag';

describe('carriesFiles', () => {
  it('a drag from the desktop carries files', () => {
    expect(carriesFiles({ types: ['Files'] })).toBe(true);
    expect(carriesFiles({ types: ['text/uri-list', 'Files'] })).toBe(true);
  });
  it('text or a link dragged inside the page does not, and neither does no drag data at all', () => {
    expect(carriesFiles({ types: ['text/plain', 'text/html'] })).toBe(false);
    expect(carriesFiles({ types: [] })).toBe(false);
    expect(carriesFiles(null)).toBe(false);
  });
});
