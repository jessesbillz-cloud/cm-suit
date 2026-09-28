import { describe, expect, it } from 'vitest';
import { LAYOUT_DEFAULTS, isTool, parseLayout, phoneTabs, pushRecent } from './layout';

describe('layout', () => {
  it('returns the defaults when there is no row', () => {
    expect(parseLayout(null)).toEqual(LAYOUT_DEFAULTS);
  });
  it('drops unknown rail tools and bad values', () => {
    const l = parseLayout({ rail_items: ['files', 'nope', 'board'], main_default: 'nope', collapsed: { rail: true, right: 1 } });
    expect(l.rail_items).toEqual(['files', 'board']);
    expect(l.main_default).toBe('board');
    expect(l.collapsed).toEqual({ rail: true, right: false });
  });
  it('keeps recent jobs most-recent-first without duplicates', () => {
    expect(pushRecent(['a', 'b', 'c'], 'b')).toEqual(['b', 'a', 'c']);
    expect(pushRecent(['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'], 'z')).toHaveLength(8);
  });
  it('knows its tools', () => {
    expect(isTool('files')).toBe(true);
    expect(isTool('rfis')).toBe(false);
  });
  it('phone bar: first four tools, the open one always on it, the rest under More', () => {
    const rail = ['board', 'files', 'bids', 'calendar', 'dailies', 'inspections'] as const;
    expect(phoneTabs(rail, 'board')).toEqual({ tabs: ['board', 'files', 'bids', 'calendar'], more: ['dailies', 'inspections', 'settings'] });
    expect(phoneTabs(rail, 'dailies')).toEqual({ tabs: ['board', 'files', 'bids', 'dailies'], more: ['calendar', 'inspections', 'settings'] });
    expect(phoneTabs(rail, 'settings').more).toEqual(['dailies', 'inspections', 'settings']);
  });
});

