// Fills an open draft from what the job knows that day (prefill.ts): when the report opens, and again whenever the
// day's facts are read anew (each time a report opens). Only a draft. A form fills its tables and safety line; the
// one who decides inspections also gets the day's inspection lines (irLines.ts), unless the form has its own
// inspections table (the superintendent's daily), so nothing is listed twice. A failed read says so with a retry;
// writing the report never waits on it.
import { useEffect } from 'react';
import { useDayFacts } from '../../data/dailies.queries';
import type { DailyReportRow, DayFacts } from '../../data/dailies.types';
import { useCapability } from '../../data/queries';
import { tablesOf, type DailyContent, type ReportForm } from '../../lib/dailies';
import { pullInspections, type Deciding } from './irLines';
import { pullFacts } from './prefill';

interface DayPrefillInput {
  projectId: string;
  report: Pick<DailyReportRow, 'status' | 'report_date'>;
  form: ReportForm | null;
  tz: string;
  content: DailyContent;
  edit: (change: (c: DailyContent) => DailyContent) => void;
}

interface At {
  day: string;
  tz: string;
}

/** Everything the day fills in on this report, or null when nothing changes. */
function pullDay(form: ReportForm | null, c: DailyContent, facts: DayFacts, at: At, irs: Deciding | null): DailyContent | null {
  const filled = form === null ? null : pullFacts(form, c, facts, at);
  const lines = irs === null ? null : pullInspections(filled ?? c, facts, irs);
  return lines ?? filled;
}

export function useDayPrefill({ projectId, report, form, tz, content, edit }: DayPrefillInput): { error: Error | null; retry: () => void } {
  const decide = useCapability(projectId, 'ir.decide').data === true;
  const ofsDecide = useCapability(projectId, 'ir.ofs_decide').data === true;
  const ownTable = form !== null && tablesOf(form).some((t) => t.source === 'inspections');
  const lines = !ownTable && (decide || ofsDecide);
  const fills = lines || (form !== null && (tablesOf(form).some((t) => t.source !== undefined) || form.safetyField !== undefined));
  const facts = useDayFacts(projectId, report.report_date, fills && report.status === 'draft');
  const day = report.report_date;

  useEffect(() => {
    if (report.status !== 'draft' || !facts.data) return;
    const data = facts.data;
    const irs = lines ? { decide, ofsDecide } : null;
    // Only an actual change is written (and autosaved); everything already filled in is left as it is.
    if (pullDay(form, content, data, { day, tz }, irs) === null) return;
    edit((c) => pullDay(form, c, data, { day, tz }, irs) ?? c);
  }, [form, report.status, facts.data, content, edit, day, tz, lines, decide, ofsDecide]);

  return { error: facts.error, retry: () => void facts.refetch() };
}
