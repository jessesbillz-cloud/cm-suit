// Weather for a daily (SPEC §18.1 principle 5; migration 0071): the pure half. Reading the US Census geocoder's and the
// National Weather Service's answers into a job's location and a day's high / low / conditions, the day arithmetic in
// the job's time zone, and the words: a form's own condition buttons, or one short line for the work log's weather box.
// No imports and no network (weatherFetch.ts makes the calls), so the browser reads this file too (the editor fills a
// report with weatherPicks / weatherLine) and everything here is unit-tested on synthetic answers.

export type WeatherSource = 'nws_forecast' | 'nws_observed';

/** A day's weather: °F, and the conditions in plain words ("Mostly Sunny", "Light Rain, Windy"). */
export interface DayWeather {
  high: number | null;
  low: number | null;
  conditions: string;
  source: WeatherSource;
}

/** The values project_weather accepts (its checks): a reading outside them is a broken sensor, not weather. */
const MIN_F = -80;
const MAX_F = 140;
const CONDITIONS_MAX = 120;
/** Sustained wind from here up is "Windy" (mph). */
const WINDY_MPH = 20;
/** The working day, in the job's local hours: its conditions are the day's conditions. */
const WORK_FROM = 6;
const WORK_TO = 18;
/** Condition buttons the temperatures tick: a high from here up is "Heat", a low down to here is "Cold". */
const HEAT_F = 95;
const COLD_F = 32;

// ---------------------------------------------------------------------------------------------------------------------
// Small readers of unknown JSON
// ---------------------------------------------------------------------------------------------------------------------
type Obj = Record<string, unknown>;

function obj(v: unknown): Obj {
  return v !== null && typeof v === 'object' && !Array.isArray(v) ? (v as Obj) : {};
}

function arr(v: unknown): unknown[] {
  return Array.isArray(v) ? v : [];
}

function str(v: unknown): string {
  return typeof v === 'string' ? v : '';
}

function num(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

// ---------------------------------------------------------------------------------------------------------------------
// The address and the location
// ---------------------------------------------------------------------------------------------------------------------
/** The job's address as it is looked up and remembered (project_places.looked_up): trimmed, single spaces. */
export function addressKey(address: string | null | undefined): string {
  return (address ?? '').trim().replace(/\s+/g, ' ').slice(0, 500);
}

export interface Place {
  lat: number;
  lon: number;
}

export interface GeocodeMatch extends Place {
  matched: string;
}

function onGlobe(lat: number | null, lon: number | null): boolean {
  return lat !== null && lon !== null && Math.abs(lat) <= 90 && Math.abs(lon) <= 180;
}

/** The geocoder answered the question (with or without a match), rather than something else entirely. */
export function isGeocodeAnswer(payload: unknown): boolean {
  return Array.isArray(obj(obj(payload)['result'])['addressMatches']);
}

/** The Census geocoder's first match (x is the longitude, y the latitude), or null when the address had none. */
export function parseGeocode(payload: unknown): GeocodeMatch | null {
  const first = obj(arr(obj(obj(payload)['result'])['addressMatches'])[0]);
  const at = obj(first['coordinates']);
  const lat = num(at['y']);
  const lon = num(at['x']);
  if (lat === null || lon === null || !onGlobe(lat, lon)) return null;
  return { lat, lon, matched: str(first['matchedAddress']).trim().slice(0, 300) };
}

/** A coordinate as the NWS wants it: four decimals at most, no trailing zeros (it redirects anything else). */
export function coord(v: number): string {
  return String(Number(v.toFixed(4)));
}

/** The same place, as far as the weather cares (about ten meters). */
export function samePlace(a: Place, b: Place): boolean {
  return Math.abs(a.lat - b.lat) < 1e-4 && Math.abs(a.lon - b.lon) < 1e-4;
}

// ---------------------------------------------------------------------------------------------------------------------
// Days in the job's time zone
// ---------------------------------------------------------------------------------------------------------------------
const DAY = /^(\d{4})-(\d{2})-(\d{2})$/;

/** A real calendar day written yyyy-MM-dd. */
export function isDay(v: string): boolean {
  const m = DAY.exec(v);
  if (!m) return false;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return d.getUTCFullYear() === Number(m[1]) && d.getUTCMonth() === Number(m[2]) - 1 && d.getUTCDate() === Number(m[3]);
}

function dayMs(day: string): number {
  const m = DAY.exec(day);
  if (!m) throw new RangeError(`Not a day: ${day}`);
  return Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

/** The wall clock in a zone at an instant, as if it were UTC (ms). An unknown zone throws (RangeError). */
function wallMs(ms: number, tz: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).formatToParts(new Date(ms));
  const p: Record<string, number> = {};
  for (const part of parts) if (part.type !== 'literal') p[part.type] = Number(part.value);
  return Date.UTC(p['year'] ?? 0, (p['month'] ?? 1) - 1, p['day'] ?? 1, p['hour'] ?? 0, p['minute'] ?? 0, p['second'] ?? 0);
}

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

/** The calendar day (yyyy-MM-dd) and the hour (0-23) in the zone at an instant. */
function localParts(ms: number, tz: string): { day: string; hour: number } {
  const w = new Date(wallMs(ms, tz));
  return { day: `${String(w.getUTCFullYear())}-${pad(w.getUTCMonth() + 1)}-${pad(w.getUTCDate())}`, hour: w.getUTCHours() };
}

/** The job's calendar day at an instant. */
export function localDay(ms: number, tz: string): string {
  return localParts(ms, tz).day;
}

/** Whole days from `from` to `to` (both yyyy-MM-dd): 1 = tomorrow, -1 = yesterday. */
export function dayDiff(to: string, from: string): number {
  return Math.round((dayMs(to) - dayMs(from)) / 86_400_000);
}

/** The instant a local day begins (ms). Right across a clock change: the offset is read at the answer itself. */
function dayStart(day: string, tz: string): number {
  const guess = dayMs(day);
  const first = guess - (wallMs(guess, tz) - guess);
  return guess - (wallMs(first, tz) - first);
}

/** A local day as instants: from its first moment to the next day's (23, 24 or 25 hours). */
export function dayBounds(day: string, tz: string): { start: number; end: number } {
  const next = new Date(dayMs(day) + 86_400_000);
  const nextDay = `${String(next.getUTCFullYear())}-${pad(next.getUTCMonth() + 1)}-${pad(next.getUTCDate())}`;
  return { start: dayStart(day, tz), end: dayStart(nextDay, tz) };
}

// ---------------------------------------------------------------------------------------------------------------------
// Units
// ---------------------------------------------------------------------------------------------------------------------
export function cToF(c: number): number {
  return (c * 9) / 5 + 32;
}

/** A whole °F the table accepts, or null. */
function wholeF(f: number | null): number | null {
  if (f === null) return null;
  const r = Math.round(f);
  return r >= MIN_F && r <= MAX_F ? r : null;
}

/** An observation's { unitCode, value } temperature in °F. */
function tempF(q: unknown): number | null {
  const v = num(obj(q)['value']);
  if (v === null) return null;
  return /degF$/i.test(str(obj(q)['unitCode'])) ? v : cToF(v);
}

/** An observation's { unitCode, value } wind speed in mph. */
function windMph(q: unknown): number | null {
  const v = num(obj(q)['value']);
  if (v === null) return null;
  const unit = str(obj(q)['unitCode']);
  if (/m_s-1$/.test(unit)) return v * 2.23694;
  if (/mi_h-1$|mph$/i.test(unit)) return v;
  if (/kn$|knot/i.test(unit)) return v * 1.15078;
  return v * 0.621371; // km/h, what the NWS sends
}

/** A forecast's "10 to 15 mph" (or km/h) as its top speed in mph. */
function forecastWindMph(text: string): number | null {
  const speeds = [...text.matchAll(/\d+(?:\.\d+)?/g)].map((m) => Number(m[0]));
  if (speeds.length === 0) return null;
  const top = Math.max(...speeds);
  return /km/i.test(text) ? top * 0.621371 : top;
}

// ---------------------------------------------------------------------------------------------------------------------
// The NWS answers
// ---------------------------------------------------------------------------------------------------------------------
export interface PointInfo {
  /** The forecast for that grid cell, and the list of stations near it. */
  forecast: string;
  stations: string;
}

/** /points/{lat},{lon}: where the forecast and the nearby stations are. */
export function parsePoints(payload: unknown): PointInfo | null {
  const p = obj(obj(payload)['properties']);
  const forecast = str(p['forecast']);
  const stations = str(p['observationStations']);
  return forecast !== '' && stations !== '' ? { forecast, stations } : null;
}

/** The stations near a point, nearest first (their identifiers, e.g. "KSAN"). */
export function parseStations(payload: unknown): string[] {
  return arr(obj(payload)['features'])
    .map((f) => str(obj(obj(f)['properties'])['stationIdentifier']))
    .filter((id) => /^[A-Za-z0-9]{3,8}$/.test(id));
}

/** A day's parts before they are put together: either half may be missing. */
export interface DayParts {
  high: number | null;
  low: number | null;
  conditions: string;
  /** The conditions are the working day's: the forecast's daytime words, or what the station saw during work. */
  byDay: boolean;
}

interface Period {
  start: number;
  end: number;
  daytime: boolean;
  temp: number | null;
  text: string;
  wind: number | null;
}

function periodsOf(payload: unknown): Period[] {
  return arr(obj(obj(payload)['properties'])['periods'])
    .map((raw): Period | null => {
      const p = obj(raw);
      const start = Date.parse(str(p['startTime']));
      const end = Date.parse(str(p['endTime']));
      if (!Number.isFinite(start) || !Number.isFinite(end)) return null;
      const t = num(p['temperature']) ?? num(obj(p['temperature'])['value']);
      const celsius = /^C$/i.test(str(p['temperatureUnit'])) || /degC$/i.test(str(obj(p['temperature'])['unitCode']));
      return {
        start, end, daytime: p['isDaytime'] === true, temp: t === null ? null : celsius ? cToF(t) : t,
        text: str(p['shortForecast']).trim(), wind: forecastWindMph(str(p['windSpeed'])),
      };
    })
    .filter((p): p is Period => p !== null)
    .sort((a, b) => a.start - b.start);
}

function withWind(text: string, wind: number | null): string {
  const windy = wind !== null && wind >= WINDY_MPH && !/wind|breez|blust|gust/i.test(text);
  return [text, windy ? 'Windy' : ''].filter((s) => s !== '').join(', ').slice(0, CONDITIONS_MAX);
}

/**
 * A day from the forecast: the high is its daytime period's, the low the night period's that runs into that morning
 * (else the evening's, when the morning has passed), the conditions the daytime period's words (else the night's).
 * Null when the forecast has nothing for that day.
 */
export function dayFromForecast(payload: unknown, day: string, tz: string): DayParts | null {
  const { start, end } = dayBounds(day, tz);
  const periods = periodsOf(payload);
  const days = periods.filter((p) => p.daytime && p.start >= start && p.start < end);
  const mornings = periods.filter((p) => !p.daytime && p.start < start + WORK_FROM * 3_600_000 && p.end > start);
  const evenings = periods.filter((p) => !p.daytime && p.start >= start + WORK_FROM * 3_600_000 && p.start < end);
  const temps = (list: Period[]) => list.map((p) => p.temp).filter((t): t is number => t !== null);
  const highs = temps(days);
  const lows = temps(mornings).length > 0 ? temps(mornings) : temps(evenings);
  const main = days[0] ?? evenings[0] ?? mornings[0];
  if (!main) return null;
  const high = wholeF(highs.length > 0 ? Math.max(...highs) : null);
  const low = wholeF(lows.length > 0 ? Math.min(...lows) : null);
  const conditions = withWind(main.text, days.length > 0 ? Math.max(...days.map((p) => p.wind ?? 0)) : main.wind);
  if (high === null && low === null && conditions === '') return null;
  return { high, low: low !== null && high !== null && low > high ? null : low, conditions, byDay: days.length > 0 };
}

const RAIN = /rain|shower|drizzle|thunder|storm/i;

/** The description seen most (the earliest wins a tie). */
function mostSeen(texts: readonly string[]): string {
  const counts = new Map<string, number>();
  for (const t of texts) counts.set(t, (counts.get(t) ?? 0) + 1);
  let best = '';
  let n = 0;
  for (const [text, count] of counts) {
    if (count > n) {
      best = text;
      n = count;
    }
  }
  return best;
}

/**
 * A day from a station's observations: the highest and lowest temperature of that local day, and the description seen
 * most during the working day (the whole day's when the station was silent then), with "Rain" added when it rained at
 * work and "Windy" when the wind got up. Null when the station has nothing for that day.
 */
export function dayFromObservations(payload: unknown, day: string, tz: string): DayParts | null {
  const { start, end } = dayBounds(day, tz);
  const seen = arr(obj(payload)['features'])
    .map((f) => {
      const p = obj(obj(f)['properties']);
      const at = Date.parse(str(p['timestamp']));
      return { at, temp: tempF(p['temperature']), text: str(p['textDescription']).trim(), wind: windMph(p['windSpeed']) };
    })
    .filter((o) => Number.isFinite(o.at) && o.at >= start && o.at < end)
    .sort((a, b) => a.at - b.at);
  const temps = seen.map((o) => o.temp).filter((t): t is number => t !== null);
  const atWork = seen.filter((o) => {
    const h = localParts(o.at, tz).hour;
    return h >= WORK_FROM && h < WORK_TO;
  });
  const byDay = atWork.some((o) => o.text !== '');
  const said = (byDay ? atWork : seen).filter((o) => o.text !== '');
  const main = mostSeen(said.map((o) => o.text));
  const rained = said.some((o) => RAIN.test(o.text)) && !RAIN.test(main);
  const wind = Math.max(0, ...(atWork.length > 0 ? atWork : seen).map((o) => o.wind ?? 0));
  const conditions = withWind([main, rained ? 'Rain' : ''].filter((s) => s !== '').join(', '), wind);
  const high = wholeF(temps.length > 0 ? Math.max(...temps) : null);
  const low = wholeF(temps.length > 0 ? Math.min(...temps) : null);
  if (high === null && low === null && conditions === '') return null;
  return { high, low, conditions, byDay };
}

/**
 * Today, while it is still going: what the station has seen so far and the forecast for the rest of the day. The high
 * is the higher of the two; the low what was seen (the morning's), else the forecast's; the conditions what was seen
 * at work, then the forecast's daytime words when they differ ("Light Rain then Mostly Sunny"). Null when neither has
 * anything.
 */
export function todayFrom(forecast: DayParts | null, seen: DayParts | null): DayParts | null {
  if (forecast === null || seen === null) return forecast ?? seen;
  const highs = [forecast.high, seen.high].filter((t): t is number => t !== null);
  const high = highs.length > 0 ? Math.max(...highs) : null;
  const low = seen.low ?? forecast.low;
  const words = [seen.byDay ? seen.conditions : '', forecast.byDay ? forecast.conditions : ''].filter((w) => w !== '');
  const conditions = words.length === 0 ? forecast.conditions || seen.conditions : [...new Set(words)].join(' then ');
  return {
    high, low: low !== null && high !== null && low > high ? null : low, conditions: conditions.slice(0, CONDITIONS_MAX),
    byDay: words.length > 0,
  };
}

// ---------------------------------------------------------------------------------------------------------------------
// The words on the report
// ---------------------------------------------------------------------------------------------------------------------
type Weather = Pick<DayWeather, 'high' | 'low' | 'conditions'>;

/** What a condition button stands for, by its own label ("Clear", "Rain" ...); a label not known here is never ticked. */
const BUTTONS: readonly { tag: string; label: RegExp }[] = [
  { tag: 'clear', label: /clear|sun|fair/i },
  { tag: 'cloudy', label: /cloud|overcast/i },
  { tag: 'rain', label: /rain|shower|storm/i },
  { tag: 'wind', label: /wind/i },
  { tag: 'fog', label: /fog|mist|haze/i },
  { tag: 'heat', label: /heat|hot/i },
  { tag: 'cold', label: /cold|freez/i },
  { tag: 'snow', label: /snow|\bice\b/i },
];

/** What the weather was, as tags. A "slight chance" of something is not that thing. */
function tagsOf(wx: Weather): Set<string> {
  const tags = new Set<string>();
  const parts = wx.conditions.split(/\bthen\b|,/i).map((s) => s.trim()).filter((s) => s !== '' && !/^slight chance/i.test(s));
  for (const part of parts) {
    // "A Few Clouds" is what a station calls a clear sky with a cloud in it.
    const few = /few clouds/i.test(part);
    const cloudy = !few && /cloud|overcast|partly sunny/i.test(part);
    if (cloudy) tags.add('cloudy');
    if (few || (!cloudy && /sunny|clear|fair/i.test(part))) tags.add('clear');
    if (RAIN.test(part)) tags.add('rain');
    if (/wind|breez|blust|gust/i.test(part)) tags.add('wind');
    if (/fog|mist|haze/i.test(part)) tags.add('fog');
    if (/snow|sleet|flurr|blizzard|\bice\b|freezing/i.test(part)) tags.add('snow');
    if (/\bhot\b|heat/i.test(part)) tags.add('heat');
    if (/\bcold\b|frost|freez/i.test(part)) tags.add('cold');
  }
  if (wx.high !== null && wx.high >= HEAT_F) tags.add('heat');
  if (wx.low !== null && wx.low <= COLD_F) tags.add('cold');
  return tags;
}

/** The form's own condition buttons this weather ticks, in the form's order, as the field stores them ("Clear, Wind"). */
export function weatherPicks(options: readonly string[], wx: Weather): string {
  const tags = tagsOf(wx);
  return options.filter((o) => BUTTONS.some((b) => tags.has(b.tag) && b.label.test(o))).join(', ');
}

/** One short line for a free-text weather box: "Mostly Sunny, high 78°F, low 61°F". */
export function weatherLine(wx: Weather): string {
  return [wx.conditions, wx.high === null ? '' : `high ${String(wx.high)}°F`, wx.low === null ? '' : `low ${String(wx.low)}°F`]
    .filter((s) => s !== '')
    .join(', ');
}
