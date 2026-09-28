import { describe, expect, it } from 'vitest';
import { formChip, groupForms, missingCount, settledCount } from './forms';

type Row = Parameters<typeof missingCount>[0][number] & { name: string };

function row(name: string, over: Partial<Row> = {}): Row {
  return { name, timing: 'with_bid', status: 'to_do', required: true, sort: 10, due_on: null, ...over };
}

const ITEMS: Row[] = [
  row('Payment bond', { timing: 'after_award', sort: 110 }),
  row('Bid bond', { sort: 20 }),
  row('Bid form', { sort: 10, status: 'done' }),
  row('Iran Contracting Act', { sort: 70, status: 'n_a' }),
  row('Site visit form', { sort: 1000, required: false }),
  row('Contract', { timing: 'after_award', sort: 160 }),
];

describe('groupForms', () => {
  it('puts the bid forms first, the award forms second, each in template order', () => {
    const groups = groupForms(ITEMS);
    expect(groups.map((g) => g.label)).toEqual(['With the bid', 'After award']);
    expect(groups[0]?.items.map((i) => i.name)).toEqual(['Bid form', 'Bid bond', 'Iran Contracting Act', 'Site visit form']);
    expect(groups[1]?.items.map((i) => i.name)).toEqual(['Payment bond', 'Contract']);
  });
  it('leaves out a group with nothing in it', () => {
    expect(groupForms([row('Bid bond')]).map((g) => g.timing)).toEqual(['with_bid']);
    expect(groupForms([])).toEqual([]);
  });
});

describe('missingCount', () => {
  it('counts required forms still to do: the bid ones while bidding', () => {
    expect(missingCount(ITEMS, 'bidding')).toBe(1);
    expect(missingCount(ITEMS, 'prospect')).toBe(1);
  });
  it('adds the award ones once the job is won', () => {
    expect(missingCount(ITEMS, 'awarded')).toBe(3);
    expect(missingCount(ITEMS, 'construction')).toBe(3);
  });
  it('drops by one when a form is done or not needed', () => {
    const done = ITEMS.map((i) => (i.name === 'Bid bond' ? { ...i, status: 'done' as const } : i));
    expect(missingCount(done, 'bidding')).toBe(0);
    expect(settledCount(done)).toBe(settledCount(ITEMS) + 1);
  });
});

describe('formChip', () => {
  const today = '2026-10-01';
  it('matches the count: yellow only for missing forms', () => {
    expect(formChip(row('a'), 'bidding', today)).toEqual({ status: 'pending', label: 'To do' });
    expect(formChip(row('a', { timing: 'after_award' }), 'bidding', today)).toEqual({ status: 'cancelled', label: 'Later' });
    expect(formChip(row('a', { timing: 'after_award' }), 'awarded', today).label).toBe('To do');
    expect(formChip(row('a', { required: false }), 'bidding', today).label).toBe('Optional');
  });
  it('shows done, N/A and overdue', () => {
    expect(formChip(row('a', { status: 'done' }), 'bidding', today).status).toBe('confirmed');
    expect(formChip(row('a', { status: 'n_a' }), 'bidding', today).label).toBe('N/A');
    expect(formChip(row('a', { due_on: '2026-09-30' }), 'bidding', today)).toEqual({ status: 'blocked', label: 'Overdue' });
    expect(formChip(row('a', { due_on: '2026-10-01' }), 'bidding', today).label).toBe('To do');
  });
});
