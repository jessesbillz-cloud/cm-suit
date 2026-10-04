import { describe, expect, it } from 'vitest';
import type { MeetingRow, Topic } from '../../data/safety.types';
import { categoriesOf, dueLine, filterTopics, linesOf, parseView, rowFacts, topicIdOf, topicItemId } from './model';
import { canStartStroke, farEnough, hasRoom, isSignature, padPoint, pointCount, strokePath } from './signature';

function topic(id: string, category: string, title: string, points: string[] = []): Topic {
  return { id, org_id: null, slug: id, category, title, language: 'en', points, questions: [], source: '8 CCR 1670', source_url: null, file_id: null, version: 1 };
}

const TOPICS = [
  topic('a', 'falls', 'Fall protection', ['Tie off to a rated anchor.']),
  topic('b', 'falls', 'Ladders', ['Three points of contact.']),
  topic('c', 'health', 'Heat illness', ['Drink water often.']),
];

describe('safety model', () => {
  it('views and item ids', () => {
    expect(parseView('library')).toBe('library');
    expect(parseView(undefined)).toBe('meetings');
    expect(parseView('nope')).toBe('meetings');
    expect(topicItemId('x')).toBe('topic-x');
    expect(topicIdOf('topic-x')).toBe('x');
    expect(topicIdOf('mock-meeting-1')).toBeNull();
  });
  it('topics: search the title, the points and the source, within a category', () => {
    expect(filterTopics(TOPICS, '', null).map((t) => t.id)).toEqual(['a', 'b', 'c']);
    expect(filterTopics(TOPICS, 'water', null).map((t) => t.id)).toEqual(['c']);
    expect(filterTopics(TOPICS, 'three contact', null).map((t) => t.id)).toEqual(['b']);
    expect(filterTopics(TOPICS, '', 'falls').map((t) => t.id)).toEqual(['a', 'b']);
    expect(filterTopics(TOPICS, '1670', 'health').map((t) => t.id)).toEqual(['c']);
    expect(categoriesOf(TOPICS)).toEqual([{ value: 'falls', label: 'Falls' }, { value: 'health', label: 'Health' }]);
  });
  it('the next tailgate', () => {
    const due = { today: '2026-10-06', last_held_on: '2026-09-22', due_on: '2026-10-06', open_count: 0 };
    expect(dueLine(due)).toEqual({ text: 'Tailgate due today', late: true });
    expect(dueLine({ ...due, due_on: '2026-10-05' })).toEqual({ text: 'Tailgate overdue', late: true });
    expect(dueLine({ ...due, due_on: '2026-10-19' })).toEqual({ text: 'Next tailgate by Oct 19', late: false });
    expect(dueLine({ ...due, last_held_on: null })).toEqual({ text: 'No tailgate yet', late: true });
  });
  it('a row\'s facts and a textarea\'s lines', () => {
    const row: MeetingRow = {
      id: 'm', number: 12, kind: 'tailgate', held_on: '2026-10-05', title: 'Heat illness', status: 'open', leader_id: 'u',
      leader_name: 'Sol Super', opened_at: '2026-10-05T14:00:00Z', closed_at: null, signed: 14, version: 2,
    };
    expect(rowFacts(row)).toBe('Tailgate · Mon, Oct 5 · Sol Super · 14 signed');
    expect(linesOf(' one \n\n  two   words \n')).toEqual(['one', 'two words']);
  });
});

describe('signature', () => {
  it('points are fractions of the pad, rounded and kept inside', () => {
    expect(padPoint(100, 50, 400, 200)).toEqual([0.25, 0.25]);
    expect(padPoint(-5, 250, 400, 200)).toEqual([0, 1]);
    expect(padPoint(1, 1, 3, 3)).toEqual([0.333, 0.333]);
  });
  it('limits, steps and what counts as a signature', () => {
    expect(pointCount([[[0, 0]], [[0.1, 0.1], [0.2, 0.2]]])).toBe(3);
    expect(hasRoom([], 1499)).toBe(true);
    expect(hasRoom([], 1500)).toBe(false);
    expect(canStartStroke(Array.from({ length: 80 }, () => [[0, 0]] as [number, number][]))).toBe(false);
    expect(farEnough(undefined, [0.5, 0.5])).toBe(true);
    expect(farEnough([0.5, 0.5], [0.501, 0.5])).toBe(false);
    expect(farEnough([0.5, 0.5], [0.52, 0.5])).toBe(true);
    expect(isSignature([[[0.5, 0.5]]])).toBe(false);
    expect(isSignature([[[0.5, 0.5], [0.505, 0.5]]])).toBe(false);
    expect(isSignature([[[0.1, 0.5], [0.4, 0.3]]])).toBe(true);
  });
  it('an SVG path per stroke', () => {
    expect(strokePath([[0, 0], [0.5, 1]], 200, 100)).toBe('M 0 0 L 100 100');
    expect(strokePath([[0.5, 0.5]], 200, 100)).toBe('M 100 50 l 0.1 0.1');
    expect(strokePath([], 200, 100)).toBe('');
  });
});
