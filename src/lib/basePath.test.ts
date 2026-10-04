import { describe, expect, it } from 'vitest';
import { inAppPath } from './basePath';

describe('inAppPath', () => {
  it('keeps a root deployment as it is', () => {
    expect(inAppPath('/p/a/files/1?window=1', '/')).toBe('/p/a/files/1?window=1');
  });
  it('puts the sub-path in front on staging', () => {
    expect(inAppPath('/p/a/files/1?window=1', '/cm-suit/')).toBe('/cm-suit/p/a/files/1?window=1');
    expect(inAppPath('/', '/cm-suit/')).toBe('/cm-suit/');
  });
  it('accepts a path without its leading slash', () => {
    expect(inAppPath('all/board', '/cm-suit')).toBe('/cm-suit/all/board');
  });
});
