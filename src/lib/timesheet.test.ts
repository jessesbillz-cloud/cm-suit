// MDR's timesheetMath tests (SPEC Appendix A: keep the tests), on synthetic jobs and numbers, plus the priorWindow
// zone fix and the screens' groupings. The ground truth: a job with a 4,000-hour contract and 300 hours used through
// Apr 30 that works 46 hours in May has used 346 and has 3,654 left.
import { describe, expect, it } from 'vitest';
import {
  addDays,
  computeBudgets,
  formatHours,
  groupHours,
  hoursText,
  monthGrid,
  monthSpan,
  priorWindow,
  shiftMonth,
  sumHours,
  usedPercent,
  weekOf,
  type HoursBudget,
  type HoursReport,
} from './timesheet';

const A: HoursBudget = { project_id: 'a', name: 'Sample Job A', contract_hours: 4000, baseline_hours: 300, baseline_through: '2026-04-30' };
const B: HoursBudget = { project_id: 'b', name: 'Sample Job B', contract_hours: 6000, baseline_hours: 500, baseline_through: '2026-04-30' };

/** 46 hours in May: five 8-hour days and one 6-hour day. */
const may = (projectId: string): HoursReport[] => [
  ...[12, 13, 14, 15, 18].map((d) => ({ project_id: projectId, report_date: `2026-05-${String(d)}`, hours: 8 })),
  { project_id: projectId, report_date: '2026-05-19', hours: 6 },
];

describe('computeBudgets: the ground truth', () => {
  it('A: 4000 / 300 + 46 May hours -> used 346, remaining 3654', () => {
    const [a] = computeBudgets({ budgets: [A], monthReports: may('a') });
    expect(a?.used).toBe(346);
    expect(a?.remaining).toBe(3654);
  });
  it('B: 6000 / 500 + 46 May hours -> used 546, remaining 5454', () => {
    const [b] = computeBudgets({ budgets: [B], monthReports: may('b') });
    expect(b?.used).toBe(546);
    expect(b?.remaining).toBe(5454);
  });
  it('an idle month: used = baseline', () => {
    const [a] = computeBudgets({ budgets: [A] });
    expect(a?.used).toBe(300);
    expect(a?.remaining).toBe(3700);
  });
  it('an overrun goes negative (the PDF prints it red)', () => {
    const [a] = computeBudgets({ budgets: [{ ...A, contract_hours: 320 }], monthReports: may('a') });
    expect(a?.remaining).toBeLessThan(0);
  });
  it("one job's earlier cutoff never counts rows for another", () => {
    const early = { ...A, baseline_through: '2026-03-31' };
    const prior: HoursReport[] = [
      { project_id: 'a', report_date: '2026-04-15', hours: 10 },
      { project_id: 'b', report_date: '2026-04-15', hours: 10 },
    ];
    const [e, l] = computeBudgets({ budgets: [early, B], priorReports: prior });
    expect(e?.used).toBe(310);
    expect(l?.used).toBe(500);
  });
  it('a report ON the cutoff day is part of the baseline (strictly after counts)', () => {
    const [a] = computeBudgets({ budgets: [A], priorReports: [{ project_id: 'a', report_date: '2026-04-30', hours: 8 }] });
    expect(a?.used).toBe(300);
  });
  it('no cutoff: every report counts', () => {
    const [a] = computeBudgets({ budgets: [{ ...A, baseline_hours: 0, baseline_through: null }], priorReports: may('a') });
    expect(a?.used).toBe(46);
  });
});

describe('priorWindow', () => {
  it('May with an Apr 30 cutoff: an empty window (nothing to fetch)', () => {
    expect(priorWindow([A], '2026-05-01')).toEqual({ priorStart: '2026-05-01', priorEnd: '2026-04-30', empty: true });
  });
  it('June with an Apr 30 cutoff: May', () => {
    expect(priorWindow([A], '2026-06-01')).toEqual({ priorStart: '2026-05-01', priorEnd: '2026-05-31', empty: false });
  });
  it('no cutoff: all history (the 1900 sentinel)', () => {
    const w = priorWindow([{ baseline_through: null }], '2026-06-01');
    expect(w.priorStart).toBe('1900-01-02');
    expect(w.empty).toBe(false);
  });
  it('day math never goes through a local Date (MDR shifted a day east of UTC)', () => {
    expect(addDays('2026-04-30', 1)).toBe('2026-05-01');
    expect(addDays('2026-03-08', 1)).toBe('2026-03-09');
    expect(addDays('2026-01-01', -1)).toBe('2025-12-31');
  });
});

describe('sums, months and the grid', () => {
  it('sums hours in tenths without float noise', () => {
    expect(sumHours(may('x'))).toBe(46);
    expect(sumHours([{ hours: 6.1 }, { hours: 0.2 }, { hours: null }])).toBe(6.3);
  });
  it('months and their days', () => {
    expect(monthSpan('2024-02').days).toBe(29);
    expect(monthSpan('2026-09')).toMatchObject({ first: '2026-09-01', last: '2026-09-30', days: 30 });
    expect(shiftMonth('2026-01', -1)).toBe('2025-12');
    expect(shiftMonth('2026-12', 1)).toBe('2027-01');
  });
  it('the grid: jobs with hours in the month, two reports on one day add up', () => {
    const grid = monthGrid(
      [
        { project_id: 'a', name: 'Sample Job A' },
        { project_id: 'c', name: 'Idle' },
      ],
      [...may('a'), { project_id: 'a', report_date: '2026-05-19', hours: 2 }, { project_id: 'a', report_date: '2026-06-01', hours: 8 }],
      '2026-05',
    );
    expect(grid).toHaveLength(1);
    expect(grid[0]?.days[19]).toBe(8);
    expect(grid[0]?.total).toBe(48);
  });
  it('prints hours without a trailing .0', () => {
    expect(formatHours(532)).toBe('532');
    expect(formatHours(6.5)).toBe('6.5');
    expect(hoursText(4508)).toBe('4,508');
  });
});

describe('the screens', () => {
  it('a week starts on Monday', () => {
    expect(weekOf('2026-09-28')).toBe('2026-09-28');
    expect(weekOf('2026-10-04')).toBe('2026-09-28');
    expect(weekOf('2026-09-27')).toBe('2026-09-21');
  });
  it('groups by week and month, newest first; a day without hours still counts as a day', () => {
    const rows = [
      { report_date: '2026-09-28', hours: 8 },
      { report_date: '2026-09-29', hours: null },
      { report_date: '2026-09-25', hours: 6.5 },
      { report_date: '2026-08-31', hours: 4 },
    ];
    expect(groupHours(rows, 'week')).toEqual([
      { key: '2026-09-28', days: 2, hours: 8 },
      { key: '2026-09-21', days: 1, hours: 6.5 },
      { key: '2026-08-31', days: 1, hours: 4 },
    ]);
    expect(groupHours(rows, 'month')).toEqual([
      { key: '2026-09', days: 3, hours: 14.5 },
      { key: '2026-08', days: 1, hours: 4 },
    ]);
  });
  it('the used bar: a share of the contract, full past it', () => {
    expect(usedPercent(346, 4000)).toBe(9);
    expect(usedPercent(5000, 4000)).toBe(100);
    expect(usedPercent(0, 0)).toBe(0);
  });
});
