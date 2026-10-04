// Fills an open draft from what the job knows that day (prefill.ts): when the report opens, and again whenever the
// day's facts are read anew (each time a report opens). Only a draft, and only a form that has something to fill. A
// failed read says so with a retry; writing the report never waits on it.
import { useEffect } from 'react';
import { useDayFacts } from '../../data/dailies.queries';
import type { DailyReportRow } from '../../data/dailies.types';
import { tablesOf, type DailyContent, type ReportForm } from '../../lib/dailies';
import { pullFacts } from './prefill';

interface DayPrefillInput {
  projectId: string;
  report: Pick<DailyReportRow, 'status' | 'report_date'>;
  form: ReportForm | null;
  tz: string;
  content: DailyContent;
  edit: (change: (c: DailyContent) => DailyContent) => void;
}

export function useDayPrefill({ projectId, report, form, tz, content, edit }: DayPrefillInput): { error: Error | null; retry: () => void } {
  const fills = form !== null && (tablesOf(form).some((t) => t.source !== undefined) || form.safetyField !== undefined);
  const facts = useDayFacts(projectId, report.report_date, fills && report.status === 'draft');
  const day = report.report_date;

  useEffect(() => {
    if (form === null || report.status !== 'draft' || !facts.data) return;
    const data = facts.data;
    // Only an actual change is written (and autosaved); everything already filled in is left as it is.
    if (pullFacts(form, content, data, { day, tz }) === null) return;
    edit((c) => pullFacts(form, c, data, { day, tz }) ?? c);
  }, [form, report.status, facts.data, content, edit, day, tz]);

  return { error: facts.error, retry: () => void facts.refetch() };
}
