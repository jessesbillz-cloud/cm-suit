// Filling a report's weather from the day's weather at the job (job-weather, migration 0071; SPEC §18.1: "weather is
// automatic ... the person can correct it"). A form's weather is its High, Low and Conditions fields; the work log's is
// its one weather box. A report whose weather is empty is filled once; what the app filled is remembered on the report
// (content.pulled, one "weather:" ref), so a later answer for the same day (the afternoon's, or what the station
// observed) replaces only the values still exactly as filled. Anything typed, changed or emptied by a person is never
// touched again. Pure, so it is unit-tested.
import type { DayWeather } from '../../data/weather.types';
import { dailyValues, type DailyContent, type FormField, type ReportForm } from '../../lib/dailies';
import { weatherLine } from '../../lib/weather';

/** The weather fields of the standard forms, by key (reportForms.ts: the superintendent's daily). */
const PARTS = ['high', 'low', 'conditions'] as const;
type Part = (typeof PARTS)[number];
type Values = Record<Part, string>;

const REF = 'weather:';
/** content.pulled holds refs of 200 characters at most. */
const REF_MAX = 200;

function fieldsOf(form: ReportForm): Partial<Record<Part, FormField>> {
  const found: Partial<Record<Part, FormField>> = {};
  for (const part of PARTS) {
    const field = form.daily.find((f) => f.key === part && f.multiline !== true);
    if (field) found[part] = field;
  }
  return found;
}

/** The form's condition buttons, sent with the question so the answer comes back in them; null for plain words. */
export function conditionOptions(form: ReportForm | null): readonly string[] | null {
  return form === null ? null : (fieldsOf(form).conditions?.options ?? null);
}

function lastRef(content: DailyContent): string | null {
  const ref = content.pulled.find((r) => r.startsWith(REF));
  return ref === undefined ? null : ref.slice(REF.length);
}

function withRef(content: DailyContent, filled: string): string[] {
  return [...content.pulled.filter((r) => !r.startsWith(REF)), `${REF}${filled}`.slice(0, REF_MAX)];
}

function encode(v: Values): string {
  return `${v.high}|${v.low}|${v.conditions}`;
}

function decode(ref: string): Values {
  const [high = '', low = '', ...rest] = ref.split('|');
  return { high, low, conditions: rest.join('|') };
}

/** The work log: its one weather box. */
function fillLine(content: DailyContent, wx: DayWeather): DailyContent | null {
  const next = weatherLine(wx).slice(0, REF_MAX - REF.length);
  const last = lastRef(content);
  const mine = last === null ? content.weather.trim() === '' : content.weather === last;
  if (!mine || next === '' || next === content.weather) return null;
  return { ...content, weather: next, pulled: withRef(content, next) };
}

function fillFields(form: ReportForm, content: DailyContent, wx: DayWeather): DailyContent | null {
  const fields = fieldsOf(form);
  const values = dailyValues(form, content.fields, content.standing_note);
  const answer: Values = { high: wx.high === null ? '' : String(wx.high), low: wx.low === null ? '' : String(wx.low), conditions: wx.conditions };
  const lastText = lastRef(content);
  const last = lastText === null ? null : decode(lastText);
  // Never filled: only a report whose weather is all empty is the app's to fill.
  if (last === null && PARTS.some((p) => fields[p] !== undefined && (values[p] ?? '').trim() !== '')) return null;
  const filled: Values = last ?? { high: '', low: '', conditions: '' };
  const changes: Record<string, string> = {};
  for (const part of PARTS) {
    const field = fields[part];
    if (field === undefined) continue;
    const now = values[part] ?? '';
    const next = answer[part].slice(0, field.max);
    if (now !== filled[part] || next === '' || next === now) continue;
    changes[part] = next;
    filled[part] = next;
  }
  if (Object.keys(changes).length === 0) return null;
  return { ...content, fields: { ...content.fields, ...changes }, pulled: withRef(content, encode(filled)) };
}

/** The report with the day's weather filled in, or null when there is nothing to fill (or nothing of the app's left). */
export function fillWeather(form: ReportForm | null, content: DailyContent, wx: DayWeather): DailyContent | null {
  if (form === null) return fillLine(content, wx);
  return fillFields(form, content, wx);
}

/**
 * Whether the weather is still worth asking for: nothing was filled yet and the report's weather is empty, or some of
 * what was filled is still as filled (a newer answer may replace it). A person's own weather is never asked about.
 */
export function awaitsWeather(form: ReportForm | null, content: DailyContent): boolean {
  const lastText = lastRef(content);
  if (form === null) return lastText === null ? content.weather.trim() === '' : content.weather === lastText;
  const fields = fieldsOf(form);
  const present = PARTS.filter((p) => fields[p] !== undefined);
  if (present.length === 0) return false;
  const values = dailyValues(form, content.fields, content.standing_note);
  if (lastText === null) return present.every((p) => (values[p] ?? '').trim() === '');
  const last = decode(lastText);
  return present.some((p) => (values[p] ?? '') === last[p]);
}
