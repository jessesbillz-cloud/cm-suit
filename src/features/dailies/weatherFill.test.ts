import { describe, expect, it } from 'vitest';
import type { DayWeather } from '../../data/weather.types';
import { dailyContentSchema, formOf, type DailyContent, type ReportForm } from '../../lib/dailies';
import { awaitsWeather, conditionOptions, fillWeather } from './weatherFill';

function form(id: string): ReportForm {
  const f = formOf(id);
  if (!f) throw new Error(`${id} is a form`);
  return f;
}

const GC = form('gc_daily');
const FOREMAN = form('foreman_daily');
const WX: DayWeather = { high: 78, low: 61, conditions: 'Clear', source: 'nws_forecast' };
const LATER: DayWeather = { high: 81, low: 59, conditions: 'Clear, Wind', source: 'nws_observed' };

function content(v: unknown = {}): DailyContent {
  return dailyContentSchema.parse(v);
}

function filled(c: DailyContent | null): DailyContent {
  if (c === null) throw new Error('expected the weather to be filled in');
  return dailyContentSchema.parse(c);
}

describe("a form's weather (the superintendent's daily)", () => {
  it('has the three weather fields this fill looks for, with condition buttons', () => {
    const short = GC.daily.filter((f) => f.multiline !== true).map((f) => f.key);
    expect(short).toEqual(expect.arrayContaining(['high', 'low', 'conditions']));
    expect(conditionOptions(GC)).toEqual(['Clear', 'Cloudy', 'Rain', 'Wind', 'Fog', 'Heat', 'Cold']);
  });

  it('fills an empty report once and remembers what it filled', () => {
    expect(awaitsWeather(GC, content())).toBe(true);
    const c = filled(fillWeather(GC, content(), WX));
    expect(c.fields).toEqual({ high: '78', low: '61', conditions: 'Clear' });
    expect(c.pulled).toEqual(['weather:78|61|Clear']);
    expect(fillWeather(GC, c, WX)).toBeNull();
  });

  it('keeps the other sources already filled in', () => {
    const c = filled(fillWeather(GC, content({ pulled: ['delivery:d1'], fields: { notes: 'Typed' } }), WX));
    expect(c.pulled).toEqual(['delivery:d1', 'weather:78|61|Clear']);
    expect(c.fields['notes']).toBe('Typed');
  });

  it('never fills a report whose weather a person started', () => {
    const typed = content({ fields: { high: '80' } });
    expect(awaitsWeather(GC, typed)).toBe(false);
    expect(fillWeather(GC, typed, WX)).toBeNull();
    expect(fillWeather(GC, content({ fields: { conditions: 'Rain' } }), WX)).toBeNull();
  });

  it('a later answer replaces only the values still as filled', () => {
    const first = filled(fillWeather(GC, content(), WX));
    const typed = content({ ...first, fields: { ...first.fields, high: '80' } });
    expect(awaitsWeather(GC, typed)).toBe(true);
    const c = filled(fillWeather(GC, typed, LATER));
    expect(c.fields).toEqual({ high: '80', low: '59', conditions: 'Clear, Wind' });
    // The typed high is still known as typed: 78 was the last value filled there.
    expect(c.pulled).toEqual(['weather:78|59|Clear, Wind']);
    expect(fillWeather(GC, c, { ...LATER, high: 90 })).toBeNull();
  });

  it('a value a person emptied stays empty, and a report all typed over is not asked about again', () => {
    const first = filled(fillWeather(GC, content(), WX));
    const emptied = content({ ...first, fields: { ...first.fields, low: '' } });
    expect(filled(fillWeather(GC, emptied, LATER)).fields['low']).toBe('');
    const mine = content({ ...first, fields: { high: '80', low: '60', conditions: 'Rain' } });
    expect(awaitsWeather(GC, mine)).toBe(false);
    expect(fillWeather(GC, mine, LATER)).toBeNull();
  });

  it('an answer without a value never blanks one', () => {
    const first = filled(fillWeather(GC, content(), WX));
    expect(fillWeather(GC, first, { high: null, low: 61, conditions: '', source: 'nws_forecast' })).toBeNull();
    const evening = filled(fillWeather(GC, content(), { high: null, low: 61, conditions: '', source: 'nws_forecast' }));
    expect(evening.fields).toEqual({ low: '61' });
    expect(filled(fillWeather(GC, evening, LATER)).fields).toEqual({ high: '81', low: '59', conditions: 'Clear, Wind' });
  });

  it('a form without weather fields has nothing to fill', () => {
    expect(conditionOptions(FOREMAN)).toBeNull();
    expect(awaitsWeather(FOREMAN, content())).toBe(false);
    expect(fillWeather(FOREMAN, content(), WX)).toBeNull();
  });
});

describe("the work log's weather box", () => {
  const PLAIN: DayWeather = { high: 78, low: 61, conditions: 'Mostly Sunny', source: 'nws_forecast' };

  it('is asked for in plain words and filled with one line', () => {
    expect(conditionOptions(null)).toBeNull();
    expect(awaitsWeather(null, content())).toBe(true);
    const c = filled(fillWeather(null, content(), PLAIN));
    expect(c.weather).toBe('Mostly Sunny, high 78°F, low 61°F');
    expect(c.pulled).toEqual(['weather:Mostly Sunny, high 78°F, low 61°F']);
    expect(fillWeather(null, c, PLAIN)).toBeNull();
  });

  it('follows a later answer while untouched; what a person typed stays', () => {
    const first = filled(fillWeather(null, content(), PLAIN));
    expect(filled(fillWeather(null, first, { ...PLAIN, high: 80 })).weather).toBe('Mostly Sunny, high 80°F, low 61°F');
    const typed = content({ ...first, weather: 'Rained out at noon' });
    expect(awaitsWeather(null, typed)).toBe(false);
    expect(fillWeather(null, typed, { ...PLAIN, high: 80 })).toBeNull();
    expect(fillWeather(null, content({ weather: 'Hot' }), PLAIN)).toBeNull();
    expect(fillWeather(null, content({ ...first, weather: '' }), PLAIN)).toBeNull();
  });
});
