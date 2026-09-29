import { describe, expect, it } from 'vitest';
import { hoursMeta, jobBudget, parseHours, reportName } from './model';

const day = (report_date: string, hours: number | null, id = report_date) => ({
  id,
  project_id: 'job-a',
  report_date,
  report_type: 'daily',
  number: 3,
  header: { label: 'Daily Report', timezone: 'America/Los_Angeles' },
  hours,
  version: 2,
});

describe('hours model', () => {
  it('typed hours: 0 to 24, in tenths', () => {
    expect(parseHours('7.5')).toBe(7.5);
    expect(parseHours(' 10 ')).toBe(10);
    expect(parseHours('24')).toBe(24);
    expect(parseHours('25')).toBeNull();
    expect(parseHours('7.25')).toBeNull();
    expect(parseHours('-1')).toBeNull();
    expect(parseHours('eight')).toBeNull();
  });
  it("the job's contract row: baseline plus my hours after its last day", () => {
    const budget = { id: 'b', project_id: 'job-a', contract_hours: 1000, baseline_hours: 100, baseline_through: '2026-08-31', version: 1 };
    const row = jobBudget(budget, [day('2026-08-31', 8), day('2026-09-01', 8), day('2026-09-02', 6.5)]);
    expect(row).toMatchObject({ contract: 1000, used: 114.5, remaining: 885.5 });
    expect(jobBudget(null, [])).toBeNull();
  });
  it('the header line: this month, then what is left (or over)', () => {
    const days = [day('2026-09-01', 8), day('2026-09-02', 6.5), day('2026-08-31', 8)];
    expect(hoursMeta(days, '2026-09', null)).toBe('14.5 h this month');
    const over = { projectId: 'job-a', name: '', contract: 10, baseline: 0, baselineThrough: null, used: 22.5, remaining: -12.5 };
    expect(hoursMeta(days, '2026-09', over)).toBe('14.5 h this month · 12.5 h over');
    expect(hoursMeta(days, '2026-09', { ...over, remaining: 4508 })).toBe('14.5 h this month · 4,508 h left');
  });
  it("a day's report: its label and number", () => {
    expect(reportName(day('2026-09-01', 8))).toBe('Daily Report #3');
    expect(reportName({ header: {}, number: null })).toBe('Daily report');
  });
});
