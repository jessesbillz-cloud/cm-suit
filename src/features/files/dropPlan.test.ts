import { describe, expect, it } from 'vitest';
import { planDrop } from './dropPlan';

const f = (name: string) => new File(['x'], name);

describe('planDrop', () => {
  it('keeps loose files in the folder being viewed', () => {
    const plan = planDrop([{ file: f('a.pdf'), dir: [] }, { file: f('b.pdf'), dir: [] }]);
    expect(plan.dirs).toEqual([]);
    expect(plan.groups).toHaveLength(1);
    expect(plan.groups[0]?.dir).toEqual([]);
    expect(plan.groups[0]?.files.map((x) => x.name)).toEqual(['a.pdf', 'b.pdf']);
  });

  it('lists every folder on the way down, parents first, once each', () => {
    const plan = planDrop([
      { file: f('1.pdf'), dir: ['Returned', '08 - Openings', 'Doors'] },
      { file: f('2.pdf'), dir: ['Returned', '03 - Concrete'] },
      { file: f('3.pdf'), dir: ['Returned', '03 - Concrete'] },
    ]);
    expect(plan.dirs).toEqual([
      ['Returned'],
      ['Returned', '03 - Concrete'],
      ['Returned', '08 - Openings'],
      ['Returned', '08 - Openings', 'Doors'],
    ]);
    expect(plan.groups.map((g) => [g.dir.join('/'), g.files.length])).toEqual([
      ['Returned/08 - Openings/Doors', 1],
      ['Returned/03 - Concrete', 2],
    ]);
  });
});
