// `deno test supabase/functions/_shared/weatherFetch_test.ts` — weather for a daily, the calls, against a pretend
// network (no test here reaches a real service): which service is asked for which day, the User-Agent on every call,
// redirects only within the one host, the size cap, a failing service, and the days and places with no weather.
import { geocode, type WeatherCalls, weatherFor, WeatherUnavailable } from './weatherFetch.ts';

function check(ok: boolean, what: string): void {
  if (!ok) throw new Error(`failed: ${what}`);
}

function same(got: unknown, want: unknown, what: string): void {
  if (JSON.stringify(got) !== JSON.stringify(want)) throw new Error(`failed: ${what}: got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);
}

const LA = 'America/Los_Angeles';
const PLACE = { lat: 33.123456, lon: -117.1 };
// Saturday Oct 3, 2 PM in Los Angeles.
const NOW = Date.parse('2026-10-03T21:00:00Z');

type Answer = { status?: number; json?: unknown; text?: string; location?: string } | (() => never);

interface Net {
  calls: WeatherCalls;
  asked: string[];
  agents: (string | null)[];
}

/** A pretend network: each URL (by prefix) has its answer; anything else is a 500. */
function net(routes: Record<string, Answer>, now = NOW): Net {
  const asked: string[] = [];
  const agents: (string | null)[] = [];
  const fetch = (url: string, init: RequestInit): Promise<Response> => {
    asked.push(url);
    agents.push(new Headers(init.headers).get('user-agent'));
    const hit = Object.keys(routes).filter((k) => url.startsWith(k)).sort((a, b) => b.length - a.length)[0];
    const answer = hit === undefined ? { status: 500, text: 'no route' } : routes[hit];
    if (typeof answer === 'function') return Promise.reject(new Error('timed out'));
    const a = answer ?? {};
    const headers = new Headers(a.location ? { location: a.location } : {});
    const body = a.text ?? (a.json === undefined ? '' : JSON.stringify(a.json));
    const status = a.status ?? 200;
    return Promise.resolve(new Response(status >= 300 && status < 400 ? null : body, { status, headers }));
  };
  return { calls: { fetch, userAgent: 'sample-app (ops@example.test)', deadline: now + 15_000, now: () => now }, asked, agents };
}

const POINTS = 'https://api.weather.gov/points/33.1235,-117.1';
const FORECAST_URL = 'https://api.weather.gov/gridpoints/XXX/10,20/forecast';
const STATIONS_URL = 'https://api.weather.gov/gridpoints/XXX/10,20/stations';
const points = { json: { properties: { forecast: FORECAST_URL, observationStations: STATIONS_URL } } };
const stations = { json: { features: [{ properties: { stationIdentifier: 'KAAA' } }, { properties: { stationIdentifier: 'KBBB' } }, { properties: { stationIdentifier: 'KCCC' } }] } };

const forecast = {
  json: {
    properties: {
      periods: [
        { startTime: '2026-10-03T14:00:00-07:00', endTime: '2026-10-03T18:00:00-07:00', isDaytime: true, temperature: 78, temperatureUnit: 'F', windSpeed: '5 mph', shortForecast: 'Mostly Sunny' },
        { startTime: '2026-10-03T18:00:00-07:00', endTime: '2026-10-04T06:00:00-07:00', isDaytime: false, temperature: 61, temperatureUnit: 'F', windSpeed: '5 mph', shortForecast: 'Mostly Clear' },
        { startTime: '2026-10-04T06:00:00-07:00', endTime: '2026-10-04T18:00:00-07:00', isDaytime: true, temperature: 82, temperatureUnit: 'F', windSpeed: '5 mph', shortForecast: 'Sunny' },
      ],
    },
  },
};

function seen(timestamp: string, celsius: number, text: string) {
  return { properties: { timestamp, textDescription: text, temperature: { unitCode: 'wmoUnit:degC', value: celsius }, windSpeed: { unitCode: 'wmoUnit:km_h-1', value: 5 } } };
}
const friday = { json: { features: [seen('2026-10-02T22:53:00+00:00', 25, 'Clear'), seen('2026-10-02T13:53:00+00:00', 15, 'Clear')] } };
const saturdaySoFar = { json: { features: [seen('2026-10-03T19:53:00+00:00', 21, 'Light Rain'), seen('2026-10-03T13:53:00+00:00', 14, 'Light Rain')] } };

async function unavailable(run: () => Promise<unknown>): Promise<string> {
  try {
    await run();
  } catch (e) {
    if (e instanceof WeatherUnavailable) return e.message;
    throw e;
  }
  throw new Error('failed: it answered');
}

Deno.test('geocode: the Census one-line address lookup; a match, no match, and a service that is not answering', async () => {
  const GEO = 'https://geocoding.geo.census.gov/geocoder/locations/onelineaddress';
  const hit = net({ [GEO]: { json: { result: { addressMatches: [{ matchedAddress: '100 SAMPLE ST', coordinates: { x: -117.1, y: 33.1 } }] } } } });
  same(await geocode(hit.calls, '100 Sample Street, Sampletown, CA 90000'), { lat: 33.1, lon: -117.1, matched: '100 SAMPLE ST' }, 'match');
  same(hit.asked, [`${GEO}?address=100%20Sample%20Street%2C%20Sampletown%2C%20CA%2090000&benchmark=Public_AR_Current&format=json`], 'the URL');
  same(hit.agents, ['sample-app (ops@example.test)'], 'the User-Agent');
  same(await geocode(net({ [GEO]: { json: { result: { addressMatches: [] } } } }).calls, '1 Nowhere'), null, 'no match');
  check((await unavailable(() => geocode(net({ [GEO]: { status: 503, text: 'busy' } }).calls, 'x'))).includes('503'), 'a 503 is not "no match"');
  check((await unavailable(() => geocode(net({ [GEO]: { json: { errors: ['x'] } } }).calls, 'x'))).includes('not a geocoder answer'), 'an odd answer is not "no match"');
  check((await unavailable(() => geocode(net({ [GEO]: { text: '<html>' } }).calls, 'x'))).includes('not JSON'), 'a page is not an answer');
  check((await unavailable(() => geocode(net({ [GEO]: () => { throw new Error('unused'); } }).calls, 'x'))).includes('no answer'), 'a timeout');
  check((await unavailable(() => geocode(net({ [GEO]: { status: 404 } }).calls, 'x'))).includes('not a geocoder answer'), 'a 404 is not "no match"');
});

Deno.test('a day ahead: the forecast only', async () => {
  const n = net({ [POINTS]: points, [FORECAST_URL]: forecast });
  same(await weatherFor(n.calls, PLACE, '2026-10-04', LA), { high: 82, low: 61, conditions: 'Sunny', source: 'nws_forecast' }, 'Sunday');
  same(n.asked, [POINTS, FORECAST_URL], 'points, then its forecast');
  check(n.agents.every((a) => a === 'sample-app (ops@example.test)'), 'the User-Agent on every call');
});

Deno.test('a day behind: the nearest station\'s observations of that local day', async () => {
  const n = net({ [POINTS]: points, [STATIONS_URL]: stations, 'https://api.weather.gov/stations/KAAA/observations': friday });
  same(await weatherFor(n.calls, PLACE, '2026-10-02', LA), { high: 77, low: 59, conditions: 'Clear', source: 'nws_observed' }, 'Friday');
  same(n.asked, [POINTS, `${STATIONS_URL}?limit=5`,
    'https://api.weather.gov/stations/KAAA/observations?start=2026-10-02T07%3A00%3A00Z&end=2026-10-03T07%3A00%3A00Z&limit=500'],
    'points, the stations, the first station from local midnight to midnight');
});

Deno.test('a silent station: the next one is asked, and no more than two', async () => {
  const n = net({
    [POINTS]: points, [STATIONS_URL]: stations,
    'https://api.weather.gov/stations/KAAA/observations': { json: { features: [] } },
    'https://api.weather.gov/stations/KBBB/observations': friday,
  });
  same((await weatherFor(n.calls, PLACE, '2026-10-02', LA))?.high, 77, 'the second station');
  const none = net({
    [POINTS]: points, [STATIONS_URL]: stations,
    'https://api.weather.gov/stations/': { json: { features: [] } },
  });
  same(await weatherFor(none.calls, PLACE, '2026-10-02', LA), null, 'nothing observed');
  same(none.asked.filter((u) => u.includes('/observations')).length, 2, 'two stations tried');
});

Deno.test('today: what was seen so far and the forecast for the rest; one half failing leaves the other', async () => {
  const obsUrl = 'https://api.weather.gov/stations/KAAA/observations';
  const n = net({ [POINTS]: points, [FORECAST_URL]: forecast, [STATIONS_URL]: stations, [obsUrl]: saturdaySoFar });
  same(await weatherFor(n.calls, PLACE, '2026-10-03', LA),
    { high: 78, low: 57, conditions: 'Light Rain then Mostly Sunny', source: 'nws_forecast' }, 'Saturday at 2 PM');
  check(n.asked.some((u) => u.endsWith('start=2026-10-03T07%3A00%3A00Z&end=2026-10-03T21%3A00%3A00Z&limit=500')), 'observations up to now');
  const noStation = net({ [POINTS]: points, [FORECAST_URL]: forecast, [STATIONS_URL]: { status: 500 } });
  same(await weatherFor(noStation.calls, PLACE, '2026-10-03', LA), { high: 78, low: 61, conditions: 'Mostly Sunny', source: 'nws_forecast' },
    'the forecast alone');
  const noForecast = net({ [POINTS]: points, [FORECAST_URL]: { status: 500 }, [STATIONS_URL]: stations, [obsUrl]: saturdaySoFar });
  same(await weatherFor(noForecast.calls, PLACE, '2026-10-03', LA), { high: 70, low: 57, conditions: 'Light Rain', source: 'nws_forecast' },
    'the observations alone');
  const neither = net({ [POINTS]: points });
  same(await weatherFor(neither.calls, PLACE, '2026-10-03', LA), null, 'neither');
});

Deno.test('no weather: a day more than six days away either way (nothing is asked); a place the NWS does not cover', async () => {
  const n = net({ [POINTS]: points });
  same(await weatherFor(n.calls, PLACE, '2026-10-10', LA), null, 'a week ahead');
  same(await weatherFor(n.calls, PLACE, '2026-09-26', LA), null, 'a week behind');
  same(n.asked, [], 'nothing was asked');
  same(await weatherFor(net({ [POINTS]: { status: 404, json: { title: 'Data Unavailable For Requested Point' } } }).calls, PLACE, '2026-10-04', LA), null,
    'not covered');
  same(await weatherFor(net({ [POINTS]: { json: { properties: {} } } }).calls, PLACE, '2026-10-04', LA), null, 'points without URLs');
});

Deno.test('a failing service is unavailable, not "no weather"', async () => {
  check((await unavailable(() => weatherFor(net({ [POINTS]: { status: 500 } }).calls, PLACE, '2026-10-04', LA))).includes('500'), 'points down');
  check((await unavailable(() => weatherFor(net({ [POINTS]: points, [FORECAST_URL]: { status: 503 } }).calls, PLACE, '2026-10-04', LA))).includes('503'),
    'forecast down');
  check((await unavailable(() => weatherFor(net({ [POINTS]: points, [STATIONS_URL]: () => { throw new Error('unused'); } }).calls, PLACE, '2026-10-02', LA)))
    .includes('no answer'), 'stations timing out');
});

Deno.test('redirects: followed within the one host only; never to another host or to plain http', async () => {
  const tidy = net({ [POINTS]: { status: 301, location: '/points/33.1235,-117.1000' }, 'https://api.weather.gov/points/33.1235,-117.1000': points, [FORECAST_URL]: forecast });
  same((await weatherFor(tidy.calls, PLACE, '2026-10-04', LA))?.high, 82, 'the NWS\'s own redirect');
  const away = net({ [POINTS]: { status: 302, location: 'https://example.test/points' } });
  check((await unavailable(() => weatherFor(away.calls, PLACE, '2026-10-04', LA))).includes('refused'), 'another host');
  same(away.asked, [POINTS], 'the other host was never called');
  const plain = net({ [POINTS]: { status: 302, location: 'http://api.weather.gov/points/1,2' } });
  check((await unavailable(() => weatherFor(plain.calls, PLACE, '2026-10-04', LA))).includes('refused'), 'plain http');
  const loop = net({ [POINTS]: { status: 302, location: POINTS } });
  check((await unavailable(() => weatherFor(loop.calls, PLACE, '2026-10-04', LA))).includes('too many redirects'), 'a loop ends');
  same(loop.asked.length, 3, 'three tries');
  const elsewhere = net({ [POINTS]: { json: { properties: { forecast: 'https://example.test/forecast', observationStations: STATIONS_URL } } } });
  check((await unavailable(() => weatherFor(elsewhere.calls, PLACE, '2026-10-04', LA))).includes('refused'), 'a forecast URL on another host');
  same(elsewhere.asked, [POINTS], 'it was never called');
});

Deno.test('limits: an answer over the size cap is refused; nothing is asked after the deadline', async () => {
  const big = net({ [POINTS]: { text: `{"x":"${'a'.repeat(2 * 1024 * 1024)}"}` } });
  check((await unavailable(() => weatherFor(big.calls, PLACE, '2026-10-04', LA))).includes('bytes'), 'too big');
  const late = net({ [POINTS]: points, [FORECAST_URL]: forecast });
  late.calls.deadline = NOW;
  check((await unavailable(() => weatherFor(late.calls, PLACE, '2026-10-04', LA))).includes('out of time'), 'out of time');
  same(late.asked, [], 'nothing was asked');
});
