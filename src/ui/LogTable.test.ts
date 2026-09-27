import { describe, expect, it } from 'vitest';
import { sortLogRows, type LogRow } from './LogTable';

const rows: LogRow[] = [
  { id: 'a', number: '9', title: 'Beta', askedAt: '2026-09-02T00:00:00Z', answeredAt: null },
  { id: 'b', number: '10', title: 'alpha', askedAt: '2026-09-01T00:00:00Z', answeredAt: '2026-09-03T00:00:00Z' },
  { id: 'c', number: '2', title: 'Gamma', askedAt: '2026-09-03T00:00:00Z', answeredAt: '2026-09-04T00:00:00Z' },
];

describe('sortLogRows', () => {
  it('sorts numbers naturally', () => {
    expect(sortLogRows(rows, 'number', 'asc').map((r) => r.number)).toEqual(['2', '9', '10']);
    expect(sortLogRows(rows, 'number', 'desc').map((r) => r.number)).toEqual(['10', '9', '2']);
  });
  it('sorts titles without case', () => {
    expect(sortLogRows(rows, 'title', 'asc').map((r) => r.id)).toEqual(['b', 'a', 'c']);
  });
  it('puts unanswered rows last either way', () => {
    expect(sortLogRows(rows, 'answeredAt', 'asc').map((r) => r.id)).toEqual(['b', 'c', 'a']);
    expect(sortLogRows(rows, 'answeredAt', 'desc').map((r) => r.id)).toEqual(['c', 'b', 'a']);
  });
});
