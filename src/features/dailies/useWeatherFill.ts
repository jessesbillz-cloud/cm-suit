// Fills an open draft's weather from the day's weather at the job (weatherFill.ts): asked once as the report opens,
// while its weather is empty or still as the app filled it. Only a draft. No weather (no address, a service down) just
// leaves the boxes empty: writing the report never waits on it, and a failed ask is logged, not shown.
import { useEffect } from 'react';
import type { DailyReportRow } from '../../data/dailies.types';
import { useDayWeather } from '../../data/weather.queries';
import type { DailyContent, ReportForm } from '../../lib/dailies';
import { awaitsWeather, conditionOptions, fillWeather } from './weatherFill';

interface WeatherFillInput {
  projectId: string;
  report: Pick<DailyReportRow, 'status' | 'report_date'>;
  form: ReportForm | null;
  content: DailyContent;
  edit: (change: (c: DailyContent) => DailyContent) => void;
}

export function useWeatherFill({ projectId, report, form, content, edit }: WeatherFillInput): void {
  const draft = report.status === 'draft';
  const ask = draft && awaitsWeather(form, content);
  const weather = useDayWeather(projectId, report.report_date, conditionOptions(form), ask);
  const answer = weather.data;
  const error = weather.error;

  useEffect(() => {
    if (!draft || !answer) return;
    // Only an actual change is written (and autosaved); anything a person typed is left as it is.
    if (fillWeather(form, content, answer) === null) return;
    edit((c) => fillWeather(form, c, answer) ?? c);
  }, [draft, answer, form, content, edit]);

  useEffect(() => {
    if (error) console.warn('daily weather: not loaded', error);
  }, [error]);
}
