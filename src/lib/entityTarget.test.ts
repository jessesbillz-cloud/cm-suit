import { describe, expect, it } from 'vitest';
import { lineTarget } from './calendarKinds';
import { entityTarget } from './entityTarget';

describe('where a record opens', () => {
  it('field records open their own item in their tool', () => {
    expect(entityTarget('file', 'f-1')).toEqual({ tool: 'files', itemId: 'f-1' });
    expect(entityTarget('inspection_request', 'ir-1')).toEqual({ tool: 'inspections', itemId: 'ir-1' });
    expect(entityTarget('delivery', 'd-1')).toEqual({ tool: 'deliveries', itemId: 'd-1' });
    expect(entityTarget('correction', 'c-1')).toEqual({ tool: 'corrections', itemId: 'c-1' });
    expect(entityTarget('daily_report', 'r-1')).toEqual({ tool: 'dailies', itemId: 'r-1' });
    expect(entityTarget('rfi', 'rfi-1')).toEqual({ tool: 'rfis', itemId: 'rfi-1' });
  });

  it('bid records open in the bids view they live in', () => {
    expect(entityTarget('addendum', 'a-1')).toEqual({ tool: 'bids', itemId: 'a-1', view: 'addenda' });
    expect(entityTarget('bid_question', 'q-1')).toEqual({ tool: 'bids', itemId: 'q-1', view: 'questions' });
    expect(entityTarget('bid_submission', 's-1')).toEqual({ tool: 'bids', itemId: 's-1', view: 'received' });
  });

  it('records that are not a row of their tool open the tool (and its view)', () => {
    expect(entityTarget('published_answer', 'pa-1')).toEqual({ tool: 'bids', itemId: null, view: 'questions' });
    expect(entityTarget('bid_invite', 'i-1')).toEqual({ tool: 'bids', itemId: null, view: 'coverage' });
    expect(entityTarget('project_member', 'm-1')).toEqual({ tool: 'people', itemId: null });
    expect(entityTarget('project_bid_due', null)).toEqual({ tool: 'bids', itemId: null });
  });

  it('opens nothing for an unknown type, no type, or a missing id', () => {
    expect(entityTarget('someone_elses_module', 'x-1')).toBeNull();
    expect(entityTarget(null, null)).toBeNull();
    expect(entityTarget('file', null)).toBeNull();
    expect(entityTarget('delivery', '')).toBeNull();
  });

  it('the calendar goes through the same mapping', () => {
    for (const type of ['delivery', 'inspection_request', 'correction', 'daily_report', 'project_bid_due', 'nope']) {
      expect(lineTarget({ id: 'line-1', source_type: type, source_id: 'src-1' })).toEqual(entityTarget(type, 'src-1'));
    }
  });
});
