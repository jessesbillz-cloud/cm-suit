import { describe, expect, it } from 'vitest';
import { entityTool } from './entityTarget';
import { badgeText, countOf, countsByTool } from './toolCounts';

describe('what needs me, per tool', () => {
  it('a record type counts on the tool that owns it (lib/entityTarget)', () => {
    expect(entityTool('inspection_request')).toBe('inspections');
    expect(entityTool('bid_question')).toBe('bids');
    expect(entityTool(null)).toBeNull();
    const rows = [
      { entity_type: 'inspection_request', n: 2 },
      { entity_type: 'daily_report', n: 1 },
      { entity_type: 'rfi', n: 3 },
    ];
    expect(countsByTool(rows, ['board', 'inspections', 'dailies', 'rfis'])).toEqual({ inspections: 2, dailies: 1, rfis: 3 });
  });
  it('a task about no record, an unknown type, or a tool this rail cannot reach counts on the Board', () => {
    const rows = [
      { entity_type: null, n: 1 },
      { entity_type: 'someone_elses_module', n: 1 },
      { entity_type: 'daily_report', n: 2 },
      { entity_type: 'bid_question', n: 1 },
    ];
    expect(countsByTool(rows, ['board', 'calendar', 'bids'])).toEqual({ board: 4, bids: 1 });
  });
  it('More adds up the tools under it; a badge stops at 9+', () => {
    expect(countOf({ dailies: 2, deliveries: 1, board: 5 }, ['dailies', 'deliveries', 'people'])).toBe(3);
    expect(countOf({}, [])).toBe(0);
    expect(badgeText(1)).toBe('1');
    expect(badgeText(9)).toBe('9');
    expect(badgeText(10)).toBe('9+');
  });
});
