// `deno test supabase/functions/_shared/timesheet_test.ts` — the hours math (MDR's timesheetMath ground truth, with
// synthetic jobs and numbers): used = baseline + hours after the baseline's last day, per job; the prior-month window
// with the zone shift fixed; the month grid. src/lib/timesheet.test.ts runs the same cases in vitest.
import {
  addDays, computeBudgets, formatHours, type HoursBudget, type HoursReport, monthGrid, monthSpan, priorWindow, shiftMonth, sumHours,
} from './timesheet.ts';

function check(ok: boolean, what: string): void {
  if (!ok) throw new Error(`failed: ${what}`);
}

const A: HoursBudget = { project_id: 'a', name: 'Sample Job A', contract_hours: 4000, baseline_hours: 300, baseline_through: '2026-04-30' };
const B: HoursBudget = { project_id: 'b', name: 'Sample Job B', contract_hours: 6000, baseline_hours: 500, baseline_through: '2026-04-30' };

/** 46 hours in May: five 8-hour days and one 6-hour day. */
function may(projectId: string): HoursReport[] {
  return [
    ...[12, 13, 14, 15, 18].map((d) => ({ project_id: projectId, report_date: `2026-05-${String(d)}`, hours: 8 })),
    { project_id: projectId, report_date: '2026-05-19', hours: 6 },
  ];
}

Deno.test('budgets: baseline plus the month', () => {
  const [a] = computeBudgets({ budgets: [A], monthReports: may('a') });
  check(a?.used === 346 && a.remaining === 3654, `A ${JSON.stringify(a)}`);
  const [b] = computeBudgets({ budgets: [B], monthReports: may('b') });
  check(b?.used === 546 && b.remaining === 5454, `B ${JSON.stringify(b)}`);
});

Deno.test('budgets: an idle month is the baseline; an overrun goes negative', () => {
  check(computeBudgets({ budgets: [A] })[0]?.used === 300, 'idle');
  check((computeBudgets({ budgets: [{ ...A, contract_hours: 320 }], monthReports: may('a') })[0]?.remaining ?? 0) < 0, 'overrun');
});

Deno.test("budgets: one job's cutoff never counts another job's rows; a report on the cutoff day is baseline", () => {
  const early = { ...A, baseline_through: '2026-03-31' };
  const prior: HoursReport[] = [
    { project_id: 'a', report_date: '2026-04-15', hours: 10 },
    { project_id: 'b', report_date: '2026-04-15', hours: 10 },
    { project_id: 'b', report_date: '2026-04-30', hours: 8 },
  ];
  const [e, l] = computeBudgets({ budgets: [early, B], priorReports: prior });
  check(e?.used === 310, `early ${String(e?.used)}`);
  check(l?.used === 500, `late ${String(l?.used)}`);
});

Deno.test('budgets: no cutoff counts every report', () => {
  const [a] = computeBudgets({ budgets: [{ ...A, baseline_through: null, baseline_hours: 0 }], priorReports: may('a') });
  check(a?.used === 46, String(a?.used));
});

Deno.test('prior window: the day after the cutoff to the day before the month, no zone shift', () => {
  const may1 = priorWindow([A], '2026-05-01');
  check(may1.priorStart === '2026-05-01' && may1.priorEnd === '2026-04-30' && may1.empty, JSON.stringify(may1));
  const jun = priorWindow([A], '2026-06-01');
  check(jun.priorStart === '2026-05-01' && jun.priorEnd === '2026-05-31' && !jun.empty, JSON.stringify(jun));
  const all = priorWindow([{ baseline_through: null }], '2026-06-01');
  check(all.priorStart === '1900-01-02' && !all.empty, JSON.stringify(all));
  check(priorWindow([B, { baseline_through: '2026-02-28' }], '2026-06-01').priorStart === '2026-03-01', 'earliest cutoff wins');
});

Deno.test('days and months', () => {
  check(addDays('2026-03-08', 1) === '2026-03-09', 'across the spring change');
  check(addDays('2026-01-01', -1) === '2025-12-31', 'back a year');
  check(monthSpan('2024-02').days === 29 && monthSpan('2026-02').last === '2026-02-28', 'February');
  check(shiftMonth('2026-01', -1) === '2025-12' && shiftMonth('2026-12', 1) === '2027-01', 'month steps');
  let threw = false;
  try {
    monthSpan('2026-13');
  } catch {
    threw = true;
  }
  check(threw, 'month 13 is refused');
});

Deno.test('sums and the month grid', () => {
  check(sumHours(may('x')) === 46, 'may');
  check(sumHours([{ hours: 6.1 }, { hours: 0.2 }, { hours: null }]) === 6.3, 'tenths, no float noise');
  const grid = monthGrid(
    [{ project_id: 'a', name: 'Sample Job A' }, { project_id: 'b', name: 'Sample Job B' }, { project_id: 'c', name: 'Idle' }],
    [...may('a'), { project_id: 'a', report_date: '2026-05-19', hours: 2 }, { project_id: 'b', report_date: '2026-06-01', hours: 8 }],
    '2026-05',
  );
  check(grid.length === 1 && grid[0]?.projectId === 'a', 'only jobs with hours in the month');
  check(grid[0]?.days[19] === 8 && grid[0]?.total === 48, 'two reports on one day add up');
  check(formatHours(532) === '532' && formatHours(6.5) === '6.5' && formatHours(-12) === '-12', 'format');
});
