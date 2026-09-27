import { describe, expect, it } from 'vitest';
import { CALENDAR_KINDS, kindLabel, lineTarget, MANUAL_KINDS } from './calendarKinds';
import { CALENDAR_TYPES } from './layout';

describe('calendar kinds', () => {
  it('every type a person can pick has one label and one icon', () => {
    expect(Object.keys(CALENDAR_KINDS).sort()).toEqual([...CALENDAR_TYPES].sort());
    for (const k of CALENDAR_TYPES) {
      expect(CALENDAR_KINDS[k].label.length).toBeGreaterThan(0);
      expect(CALENDAR_KINDS[k].icon).toBeTruthy();
    }
    expect(new Set(Object.values(CALENDAR_KINDS).map((v) => v.label)).size).toBe(CALENDAR_TYPES.length);
  });

  it('people add meetings, pours, milestones and look-ahead lines by hand', () => {
    expect([...MANUAL_KINDS]).toEqual(['meetings', 'pours', 'milestones', 'lookahead']);
  });

  it('labels unknown kinds as written', () => {
    expect(kindLabel('deliveries')).toBe('Deliveries');
    expect(kindLabel('something_new')).toBe('something_new');
  });
});

describe('where a line opens', () => {
  const at = (source_type: string, source_id: string | null = 'src-1') => lineTarget({ id: 'line-1', source_type, source_id });

  it('a manual line opens in the calendar', () => {
    expect(at('manual', null)).toEqual({ tool: 'calendar', itemId: 'line-1' });
  });

  it('a mirrored line opens its module item', () => {
    expect(at('delivery')).toEqual({ tool: 'deliveries', itemId: 'src-1' });
    expect(at('inspection_request')).toEqual({ tool: 'inspections', itemId: 'src-1' });
    expect(at('correction')).toEqual({ tool: 'corrections', itemId: 'src-1' });
    expect(at('daily_report')).toEqual({ tool: 'dailies', itemId: 'src-1' });
  });

  it("the job's bid time opens the bids tool, not an item", () => {
    expect(at('project_bid_due')).toEqual({ tool: 'bids', itemId: null });
  });

  it('an unknown source opens nothing', () => {
    expect(at('someone_elses_module')).toBeNull();
  });
});
