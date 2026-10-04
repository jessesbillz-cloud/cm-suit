import { describe, expect, it } from 'vitest';
import type { Activity } from '../../data/schedule.types';
import { DRAFT_ITEM_PREFIX, VERSION_ITEM_PREFIX } from '../../lib/itemIds';
import { dateSpan, draftItemId, itemRef, lookAhead, matches, parseRange, parseView, versionItemId, versionName, weekLabel, weekSpan } from './model';

function act(id: string, start: string | null, finish: string | null, over: Partial<Activity> = {}): Activity {
  return {
    id, version_id: 'v1', activity_code: id.toUpperCase(), name: `Sample ${id}`, wbs: null, area: null, trade: null, start_date: start,
    finish_date: finish, actual_start: null, actual_finish: null, percent: null, is_milestone: false, csi_division: null, sort: 0, ...over,
  };
}

// Wednesday, Oct 7 2026: this week is Monday Oct 5 to Sunday Oct 11.
const TODAY = '2026-10-07';
const LIST = [
  act('far', '2026-12-15', '2026-12-20'),
  act('w1', '2026-10-14', '2026-10-16'),
  act('u1', '2026-09-28', '2026-10-09', { actual_start: '2026-09-28', percent: 40 }),
  act('ended', '2026-09-20', '2026-10-01'),
  act('done', '2026-10-05', '2026-10-06', { actual_finish: '2026-10-06' }),
  act('w0b', '2026-10-08', '2026-10-08'),
  act('w0a', '2026-10-05', '2026-10-09'),
  act('w2', '2026-10-21', '2026-10-30'),
  act('w3', '2026-10-28', '2026-11-02'),
  act('nodate', null, null),
];

describe('the look-ahead', () => {
  it('3 weeks: what is underway, then each week\'s starts, from this week\'s Monday', () => {
    const la = lookAhead(LIST, TODAY, '3w');
    expect(la.underway.map((a) => a.id)).toEqual(['u1']);
    expect(la.weeks.map((w) => w.start)).toEqual(['2026-10-05', '2026-10-12', '2026-10-19']);
    expect(la.weeks.map((w) => w.items.map((a) => a.id))).toEqual([['w0a', 'w0b'], ['w1'], ['w2']]);
  });

  it('2 months: nine weeks; nothing past them, nothing done, nothing without a date', () => {
    const la = lookAhead(LIST, TODAY, '2m');
    expect(la.weeks).toHaveLength(9);
    expect(la.weeks[3]?.items.map((a) => a.id)).toEqual(['w3']);
    const shown = [...la.underway, ...la.weeks.flatMap((w) => w.items)].map((a) => a.id);
    expect(shown.filter((id) => ['far', 'done', 'ended', 'nodate'].includes(id))).toEqual([]);
  });

  it('a 100% activity is done even without an actual finish', () => {
    const la = lookAhead([act('x', '2026-10-08', '2026-10-09', { percent: 100 })], TODAY, '3w');
    expect(la.weeks[0]?.items).toEqual([]);
  });

  it('weeks are named by when they are', () => {
    expect(weekLabel('2026-10-05', TODAY)).toBe('This week');
    expect(weekLabel('2026-10-12', TODAY)).toBe('Next week');
    expect(weekLabel('2026-10-19', TODAY)).toBeNull();
    expect(weekSpan('2026-10-05')).toBe('Oct 5 – 11');
    expect(weekSpan('2026-09-28')).toBe('Sep 28 – Oct 4');
  });
});

describe('labels', () => {
  it('dates: one day, a span, a milestone, none', () => {
    expect(dateSpan(act('a', '2026-10-05', '2026-10-05'))).toBe('Oct 5');
    expect(dateSpan(act('a', '2026-10-05', '2026-10-16'))).toBe('Oct 5 – Oct 16');
    expect(dateSpan(act('a', '2026-10-16', '2026-10-17', { is_milestone: true }))).toBe('Oct 16');
    expect(dateSpan(act('a', null, null))).toBe('No date');
  });

  it('a version is Draft until published, then its update number', () => {
    expect(versionName({ number: null, status: 'draft' })).toBe('Draft');
    expect(versionName({ number: 2, status: 'draft' })).toBe('Draft');
    expect(versionName({ number: 3, status: 'current' })).toBe('Update 3');
  });
});

describe('search', () => {
  it('any word, in any order, over the name, ID, area, trade and WBS', () => {
    const a = act('a2010', '2026-10-05', '2026-10-09', { name: 'Hang drywall', area: 'Level 2', trade: 'Sample Drywall Co', wbs: 'Building A' });
    expect(matches(a, '')).toBe(true);
    expect(matches(a, 'drywall level')).toBe(true);
    expect(matches(a, 'A2010')).toBe(true);
    expect(matches(a, 'building a')).toBe(true);
    expect(matches(a, 'paint')).toBe(false);
  });
});

describe('where things are', () => {
  it('views and windows from the URL, defaults otherwise', () => {
    expect(parseView('updates')).toBe('updates');
    expect(parseView('activities')).toBe('activities');
    expect(parseView('nope')).toBe('lookahead');
    expect(parseView(undefined)).toBe('lookahead');
    expect(parseRange('2m')).toBe('2m');
    expect(parseRange('6w')).toBe('3w');
  });

  it('item ids: a draft, a published version, else an activity', () => {
    expect(draftItemId('v1')).toBe(`${DRAFT_ITEM_PREFIX}v1`);
    expect(versionItemId('v1')).toBe(`${VERSION_ITEM_PREFIX}v1`);
    expect(itemRef(draftItemId('v1'))).toEqual({ kind: 'draft', id: 'v1' });
    expect(itemRef(versionItemId('v1'))).toEqual({ kind: 'version', id: 'v1' });
    expect(itemRef('0f9a7c1e-0000-4000-8000-000000000001')).toEqual({ kind: 'activity', id: '0f9a7c1e-0000-4000-8000-000000000001' });
  });
});
