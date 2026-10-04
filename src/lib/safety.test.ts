import { describe, expect, it } from 'vitest';
import { categoryLabel, meetingLabel, meetingLinkKey, meetingLinkUrl, SAFETY_CATEGORIES, tailgateDue } from './safety';

describe('safety', () => {
  it('categories: the database list, with labels', () => {
    expect(SAFETY_CATEGORIES.map((c) => c.value)).toEqual(['falls', 'health', 'electrical', 'equipment', 'excavation', 'fire', 'site', 'other']);
    expect(categoryLabel('falls')).toBe('Falls');
    expect(categoryLabel('unknown')).toBe('unknown');
  });
  it('labels and the sign-in link', () => {
    expect(meetingLabel('tailgate', 12)).toBe('Tailgate 12');
    expect(meetingLabel('meeting', 3)).toBe('Meeting 3');
    expect(meetingLinkUrl('https://example.test', '/app/', 'm-1', 'a b')).toBe('https://example.test/app/m/m-1?t=a%20b');
    expect(meetingLinkUrl('https://example.test', '/', 'm-1', 'tok')).toBe('https://example.test/m/m-1?t=tok');
    expect(meetingLinkKey('m-1')).toBe('app:meeting-link:m-1');
  });
  it('the next tailgate: overdue, today or later', () => {
    expect(tailgateDue('2026-10-06', '2026-10-05')).toBe('overdue');
    expect(tailgateDue('2026-10-06', '2026-10-06')).toBe('today');
    expect(tailgateDue('2026-10-06', '2026-10-19')).toBe('later');
  });
});
