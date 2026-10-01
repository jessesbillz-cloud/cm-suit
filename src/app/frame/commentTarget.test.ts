import { describe, expect, it } from 'vitest';
import { commentEntity } from '../../lib/entityTarget';
import { commentTarget } from './commentTarget';

describe('which opened items take comments', () => {
  it('records in the field tools and files take them, as their record type', () => {
    expect(commentTarget('rfis', 'r-1')).toEqual({ entityType: 'rfi', entityId: 'r-1' });
    expect(commentTarget('inspections', 'ir-1')).toEqual({ entityType: 'inspection_request', entityId: 'ir-1' });
    expect(commentTarget('files', 'f-1')).toEqual({ entityType: 'file', entityId: 'f-1' });
    expect(commentTarget('dailies', 'd-1')).toEqual({ entityType: 'daily_report', entityId: 'd-1' });
    expect(commentTarget('corrections', 'c-1')).toEqual({ entityType: 'correction', entityId: 'c-1' });
    expect(commentTarget('deliveries', 'x-1')).toEqual({ entityType: 'delivery', entityId: 'x-1' });
  });

  it('forms and pages in the right column take none', () => {
    expect(commentTarget('rfis', 'new')).toBeNull();
    expect(commentTarget('inspections', 'new')).toBeNull();
    expect(commentTarget('inspections', 'block')).toBeNull();
    expect(commentTarget('inspections', 'share')).toBeNull();
    expect(commentTarget('dailies', 'setup')).toBeNull();
    expect(commentTarget('deliveries', 'new')).toBeNull();
    expect(commentTarget('corrections', 'new')).toBeNull();
    expect(commentTarget('corrections', 'progress')).toBeNull();
    expect(commentTarget('files', '')).toBeNull();
  });

  it('tools without a commented record take none', () => {
    expect(commentTarget('board', 'line-1')).toBeNull();
    expect(commentTarget('bids', 'q-1')).toBeNull();
    expect(commentTarget('calendar', 'c-1')).toBeNull();
    expect(commentTarget('hours', 'h-1')).toBeNull();
    expect(commentEntity('timesheets')).toBeNull();
  });
});
