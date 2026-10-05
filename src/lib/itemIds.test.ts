import { describe, expect, it } from 'vitest';
import {
  BLOCK_ITEM, boardLineItem, boardLineOf, DRAFT_ITEM_PREFIX, itemKindTitle, NEW_ITEM, opensInMain, SUBSCRIBE_ITEM, VERSION_ITEM_PREFIX, WALLS_ITEM,
} from './itemIds';

describe('opensInMain', () => {
  it('a Revs wall is a page of its own; its setup forms and every other item open in the right column', () => {
    expect(opensInMain('revs', 'mock-rev-area-1')).toBe(true);
    expect(opensInMain('revs', NEW_ITEM)).toBe(false);
    expect(opensInMain('revs', WALLS_ITEM)).toBe(false);
    expect(opensInMain('inspections', 'mock-ir-1')).toBe(false);
    expect(opensInMain('files', 'file-1')).toBe(false);
  });
  it('a schedule draft\'s review is a page of its own; a published version and an activity open in the right column', () => {
    expect(opensInMain('schedule', `${DRAFT_ITEM_PREFIX}v1`)).toBe(true);
    expect(opensInMain('schedule', `${VERSION_ITEM_PREFIX}v1`)).toBe(false);
    expect(opensInMain('schedule', 'activity-1')).toBe(false);
  });
});

describe('itemKindTitle', () => {
  it("a calendar item is titled by its kind, never just 'Calendar'", () => {
    expect(itemKindTitle('calendar', NEW_ITEM)).toBe('New line');
    expect(itemKindTitle('calendar', BLOCK_ITEM)).toBe('Block time');
    expect(itemKindTitle('calendar', SUBSCRIBE_ITEM)).toBe('Subscribe');
    expect(itemKindTitle('calendar', 'ir.job-a.req-1')).toBe('Inspection');
    expect(itemKindTitle('calendar', 'line-1')).toBe('Calendar line');
  });
  it('the post form is "Post delivery", a delivery "Delivery"; other tools keep the frame\'s titles', () => {
    expect(itemKindTitle('deliveries', NEW_ITEM)).toBe('Post delivery');
    expect(itemKindTitle('deliveries', 'd-1')).toBe('Delivery');
    expect(itemKindTitle('files', 'f-1')).toBeNull();
  });
});

describe('a board line opened beside another tool', () => {
  it('is that tool\'s item and comes back as the line; a record\'s own id is never one', () => {
    expect(boardLineOf(boardLineItem('line-1'))).toBe('line-1');
    expect(boardLineOf('line-1')).toBeNull();
    expect(boardLineOf('3f1c2a9e-0000-4000-8000-000000000001')).toBeNull();
    expect(boardLineOf(null)).toBeNull();
    expect(opensInMain('revs', boardLineItem('a1'))).toBe(false);
  });
});
