// Weather for a daily (migration 0071): the calls. The US Census geocoder turns the job's address into a location; the
// National Weather Service answers a day's weather for it: the forecast for the days ahead, the nearest station's
// observations for the days behind, and both for today. Free, no key; the NWS asks for a User-Agent that says who is
// calling. Every call has a time limit and a size cap, goes only to the one host it is meant for (a redirect too), and
// takes its `fetch` from the caller, so the tests never touch the network. A service that fails or is slow throws
// WeatherUnavailable: the caller answers "no weather" and the daily goes on. Reading the answers is weather.ts.
import {
  coord,
  dayBounds,
  dayDiff,
  dayFromForecast,
  dayFromObservations,
  type DayParts,
  type DayWeather,
  type GeocodeMatch,
  isGeocodeAnswer,
  localDay,
  parseGeocode,
  parsePoints,
  parseStations,
  type Place,
  todayFrom,
} from './weather.ts';

export type Fetch = (url: string, init: RequestInit) => Promise<Response>;

export interface WeatherCalls {
  fetch: Fetch;
  /** Who is calling (the NWS requires it): WEATHER_USER_AGENT. */
  userAgent: string;
  /** Epoch ms: nothing is asked after this, so the request never hangs on a slow service. */
  deadline: number;
  now: () => number;
}

export class WeatherUnavailable extends Error {}

const CENSUS_HOST = 'geocoding.geo.census.gov';
const NWS_HOST = 'api.weather.gov';
/** One call's time limit, its size cap and how many redirects it follows (the NWS redirects to its own tidy URLs). */
const CALL_MS = 6000;
const MAX_BYTES = 2 * 1024 * 1024;
const MAX_HOPS = 2;
/** The forecast reaches a week ahead and a station keeps about a week of observations. */
export const DAYS_AHEAD = 6;
export const DAYS_BACK = 6;
/** Stations tried for a day's observations, nearest first. */
const STATIONS_TRIED = 2;

async function readCapped(res: Response, what: string): Promise<string> {
  if (!res.body) return '';
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_BYTES) {
      await reader.cancel();
      throw new WeatherUnavailable(`${what}: the answer is over ${String(MAX_BYTES)} bytes`);
    }
    chunks.push(value);
  }
  const all = new Uint8Array(total);
  let at = 0;
  for (const c of chunks) {
    all.set(c, at);
    at += c.byteLength;
  }
  return new TextDecoder().decode(all);
}

/** GETs JSON from `host` only. Null for a 404 (the service has nothing there); anything else that is not an answer throws. */
async function getJson(calls: WeatherCalls, url: string, host: string): Promise<unknown> {
  let next = url;
  for (let hop = 0; hop <= MAX_HOPS; hop++) {
    let target: URL;
    try {
      target = new URL(next);
    } catch (e) {
      throw new WeatherUnavailable(`${host}: not a URL (${e instanceof Error ? e.message : String(e)})`);
    }
    if (target.protocol !== 'https:' || target.hostname !== host) throw new WeatherUnavailable(`${host}: refused to call ${target.origin}`);
    const left = calls.deadline - calls.now();
    if (left <= 0) throw new WeatherUnavailable(`${host}: out of time`);
    let res: Response;
    try {
      res = await calls.fetch(target.toString(), {
        method: 'GET',
        redirect: 'manual',
        headers: { 'user-agent': calls.userAgent, accept: 'application/geo+json, application/json' },
        signal: AbortSignal.timeout(Math.min(CALL_MS, left)),
      });
    } catch (e) {
      throw new WeatherUnavailable(`${host}: no answer (${e instanceof Error ? e.message : String(e)})`);
    }
    if (res.status >= 300 && res.status < 400) {
      const to = res.headers.get('location');
      await res.body?.cancel();
      if (!to) throw new WeatherUnavailable(`${host}: a redirect to nowhere`);
      next = new URL(to, target).toString();
      continue;
    }
    if (res.status === 404) {
      await res.body?.cancel();
      return null;
    }
    if (!res.ok) {
      await res.body?.cancel();
      throw new WeatherUnavailable(`${host}: answered ${String(res.status)}`);
    }
    let text: string;
    try {
      text = await readCapped(res, host);
    } catch (e) {
      if (e instanceof WeatherUnavailable) throw e;
      throw new WeatherUnavailable(`${host}: the answer broke off (${e instanceof Error ? e.message : String(e)})`);
    }
    try {
      return JSON.parse(text) as unknown;
    } catch (e) {
      throw new WeatherUnavailable(`${host}: not JSON (${e instanceof Error ? e.message : String(e)})`);
    }
  }
  throw new WeatherUnavailable(`${host}: too many redirects`);
}

/** The address's first match, or null when the geocoder knows no such address. Throws when it did not answer. */
export async function geocode(calls: WeatherCalls, address: string): Promise<GeocodeMatch | null> {
  const url = `https://${CENSUS_HOST}/geocoder/locations/onelineaddress?address=${encodeURIComponent(address)}` +
    '&benchmark=Public_AR_Current&format=json';
  const answer = await getJson(calls, url, CENSUS_HOST);
  if (!isGeocodeAnswer(answer)) throw new WeatherUnavailable(`${CENSUS_HOST}: not a geocoder answer`);
  return parseGeocode(answer);
}

/** An instant as the NWS reads it: no milliseconds. */
function stamp(ms: number): string {
  return new Date(ms).toISOString().replace(/\.\d{3}Z$/, 'Z');
}

/** What the nearest stations saw that local day (up to `until`): the first one with temperatures, else whatever a station had. */
async function observed(calls: WeatherCalls, stationsUrl: string, day: string, tz: string, until: number): Promise<DayParts | null> {
  let list: URL;
  try {
    list = new URL(stationsUrl);
  } catch (e) {
    throw new WeatherUnavailable(`${NWS_HOST}: not a URL (${e instanceof Error ? e.message : String(e)})`);
  }
  list.searchParams.set('limit', '5');
  const stations = parseStations(await getJson(calls, list.toString(), NWS_HOST)).slice(0, STATIONS_TRIED);
  const { start, end } = dayBounds(day, tz);
  let some: DayParts | null = null;
  for (const id of stations) {
    const url = `https://${NWS_HOST}/stations/${encodeURIComponent(id)}/observations?start=${encodeURIComponent(stamp(start))}` +
      `&end=${encodeURIComponent(stamp(Math.min(end, until)))}&limit=500`;
    const parts = dayFromObservations(await getJson(calls, url, NWS_HOST), day, tz);
    if (parts && parts.high !== null) return parts;
    some = some ?? parts;
  }
  return some;
}

/** One half of today's weather: a half that fails is logged and left out, so the other half still answers. */
async function half(what: string, read: () => Promise<DayParts | null>): Promise<DayParts | null> {
  try {
    return await read();
  } catch (e) {
    if (!(e instanceof WeatherUnavailable)) throw e;
    console.warn(`weather: today's ${what} did not load: ${e.message}`);
    return null;
  }
}

/**
 * The weather at a place on a day of the job's calendar, or null when the NWS has nothing for it: a day more than a
 * week away either way, a place it does not cover, a silent station. Throws WeatherUnavailable when it did not answer.
 */
export async function weatherFor(calls: WeatherCalls, place: Place, day: string, tz: string): Promise<DayWeather | null> {
  const diff = dayDiff(day, localDay(calls.now(), tz));
  if (diff > DAYS_AHEAD || diff < -DAYS_BACK) return null;
  const point = parsePoints(await getJson(calls, `https://${NWS_HOST}/points/${coord(place.lat)},${coord(place.lon)}`, NWS_HOST));
  if (!point) return null;
  const forecast = async () => dayFromForecast(await getJson(calls, point.forecast, NWS_HOST), day, tz);
  const seen = () => observed(calls, point.stations, day, tz, calls.now());
  let parts: DayParts | null;
  if (diff > 0) parts = await forecast();
  else if (diff < 0) parts = await seen();
  else {
    const [ahead, sofar] = await Promise.all([half('forecast', forecast), half('observations', seen)]);
    parts = todayFrom(ahead, sofar);
  }
  if (!parts) return null;
  return { high: parts.high, low: parts.low, conditions: parts.conditions, source: diff < 0 ? 'nws_observed' : 'nws_forecast' };
}
