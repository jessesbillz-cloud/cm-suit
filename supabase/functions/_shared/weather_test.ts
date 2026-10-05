// `deno test supabase/functions/_shared/weather_test.ts` — weather for a daily, the pure half, on synthetic answers:
// the geocoder's match, the NWS points and stations, a day from the forecast and from a station's observations (the
// job's own day in its time zone, clock changes too, Celsius to Fahrenheit), today's blend, and the words on a report.
import {
  addressKey,
  coord,
  cToF,
  dayBounds,
  dayDiff,
  dayFromForecast,
  dayFromObservations,
  isDay,
  isGeocodeAnswer,
  localDay,
  parseGeocode,
  parsePoints,
  parseStations,
  samePlace,
  todayFrom,
  weatherLine,
  weatherPicks,
} from './weather.ts';

function check(ok: boolean, what: string): void {
  if (!ok) throw new Error(`failed: ${what}`);
}

function same(got: unknown, want: unknown, what: string): void {
  if (JSON.stringify(got) !== JSON.stringify(want)) throw new Error(`failed: ${what}: got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);
}

const LA = 'America/Los_Angeles';
const at = (iso: string) => Date.parse(iso);

Deno.test('address: trimmed, single spaces, 500 characters at most; empty for none', () => {
  same(addressKey('  100  Sample   Street,\n Sampletown '), '100 Sample Street, Sampletown', 'spaces');
  same(addressKey(null), '', 'null');
  same(addressKey(undefined), '', 'undefined');
  same(addressKey('x'.repeat(600)).length, 500, 'cut');
});

Deno.test('geocoder: the first match (x = longitude, y = latitude); no match; not an answer', () => {
  const answer = {
    result: {
      addressMatches: [
        { matchedAddress: '100 SAMPLE ST, SAMPLETOWN, CA, 90000', coordinates: { x: -117.123456, y: 33.123456 } },
        { matchedAddress: '100 SAMPLE AVE, SAMPLETOWN, CA, 90000', coordinates: { x: -118, y: 34 } },
      ],
    },
  };
  check(isGeocodeAnswer(answer), 'an answer');
  same(parseGeocode(answer), { lat: 33.123456, lon: -117.123456, matched: '100 SAMPLE ST, SAMPLETOWN, CA, 90000' }, 'first match');
  check(isGeocodeAnswer({ result: { addressMatches: [] } }), 'no match is still an answer');
  same(parseGeocode({ result: { addressMatches: [] } }), null, 'no match');
  check(!isGeocodeAnswer({ errors: ['busy'] }) && !isGeocodeAnswer(null) && !isGeocodeAnswer('x'), 'not an answer');
  same(parseGeocode({ result: { addressMatches: [{ coordinates: { x: 'a', y: 33 } }] } }), null, 'a match without numbers is no match');
  same(parseGeocode({ result: { addressMatches: [{ coordinates: { x: -117, y: 133 } }] } }), null, 'off the globe is no match');
});

Deno.test('coordinates: four decimals, no trailing zeros; the same place within about ten meters', () => {
  same(coord(33.123456), '33.1235', 'rounded');
  same(coord(33.1), '33.1', 'no trailing zeros');
  same(coord(-117), '-117', 'whole');
  check(samePlace({ lat: 33.12345, lon: -117.12345 }, { lat: 33.12349, lon: -117.12341 }), 'same');
  check(!samePlace({ lat: 33.1234, lon: -117.1234 }, { lat: 33.1244, lon: -117.1234 }), 'moved');
});

Deno.test('days: a real calendar day; the difference in days', () => {
  check(isDay('2026-10-04') && isDay('2028-02-29'), 'real days');
  check(!isDay('2026-02-30') && !isDay('2026-13-01') && !isDay('10/04/2026') && !isDay(''), 'not days');
  same(dayDiff('2026-10-05', '2026-10-04'), 1, 'tomorrow');
  same(dayDiff('2026-09-30', '2026-10-04'), -4, 'four days back');
  same(dayDiff('2026-11-02', '2026-11-01'), 1, 'across the clock change');
});

Deno.test('time zones: the job\'s day at an instant, and a local day as instants (23, 24 and 25 hours)', () => {
  same(localDay(at('2026-10-04T06:59:00Z'), LA), '2026-10-03', 'just before midnight in Los Angeles');
  same(localDay(at('2026-10-04T07:00:00Z'), LA), '2026-10-04', 'midnight in Los Angeles');
  same(localDay(at('2026-10-03T18:30:00Z'), 'Asia/Kolkata'), '2026-10-04', 'a half-hour zone');
  same(dayBounds('2026-10-03', LA), { start: at('2026-10-03T07:00:00Z'), end: at('2026-10-04T07:00:00Z') }, '24 hours');
  same(dayBounds('2026-11-01', LA), { start: at('2026-11-01T07:00:00Z'), end: at('2026-11-02T08:00:00Z') }, 'clocks back: 25 hours');
  same(dayBounds('2026-03-08', LA), { start: at('2026-03-08T08:00:00Z'), end: at('2026-03-09T07:00:00Z') }, 'clocks forward: 23 hours');
  same(dayBounds('2026-10-03', 'Asia/Kolkata').start, at('2026-10-02T18:30:00Z'), 'a half-hour zone');
  same(dayBounds('2026-10-03', 'UTC'), { start: at('2026-10-03T00:00:00Z'), end: at('2026-10-04T00:00:00Z') }, 'UTC');
  let threw = false;
  try {
    dayBounds('2026-10-03', 'Nowhere/Land');
  } catch (e) {
    threw = e instanceof RangeError;
  }
  check(threw, 'an unknown zone throws');
});

Deno.test('Celsius to Fahrenheit', () => {
  same(cToF(100), 212, 'boiling');
  same(cToF(0), 32, 'freezing');
  same(cToF(-40), -40, 'where they meet');
});

Deno.test('points and stations: the forecast and station list URLs; station ids, nearest first', () => {
  same(parsePoints({ properties: { forecast: 'https://api.weather.gov/gridpoints/XXX/1,2/forecast', observationStations: 'https://api.weather.gov/gridpoints/XXX/1,2/stations' } }),
    { forecast: 'https://api.weather.gov/gridpoints/XXX/1,2/forecast', stations: 'https://api.weather.gov/gridpoints/XXX/1,2/stations' }, 'points');
  same(parsePoints({ properties: { forecast: 'https://api.weather.gov/x' } }), null, 'half an answer');
  same(parsePoints(null), null, 'nothing');
  same(parseStations({ features: [{ properties: { stationIdentifier: 'KAAA' } }, { properties: {} }, { properties: { stationIdentifier: '../x' } }, { properties: { stationIdentifier: 'KBBB' } }] }),
    ['KAAA', 'KBBB'], 'ids only');
  same(parseStations({}), [], 'no stations');
});

// A forecast read on Saturday Oct 3 at 9 AM in Los Angeles.
const FORECAST = {
  properties: {
    periods: [
      { number: 1, name: 'Today', startTime: '2026-10-03T09:00:00-07:00', endTime: '2026-10-03T18:00:00-07:00', isDaytime: true,
        temperature: 78, temperatureUnit: 'F', windSpeed: '5 to 10 mph', shortForecast: 'Mostly Sunny' },
      { number: 2, name: 'Tonight', startTime: '2026-10-03T18:00:00-07:00', endTime: '2026-10-04T06:00:00-07:00', isDaytime: false,
        temperature: 61, temperatureUnit: 'F', windSpeed: '5 mph', shortForecast: 'Mostly Clear' },
      { number: 3, name: 'Sunday', startTime: '2026-10-04T06:00:00-07:00', endTime: '2026-10-04T18:00:00-07:00', isDaytime: true,
        temperature: 82, temperatureUnit: 'F', windSpeed: '15 to 25 mph', shortForecast: 'Sunny' },
      { number: 4, name: 'Sunday Night', startTime: '2026-10-04T18:00:00-07:00', endTime: '2026-10-05T06:00:00-07:00', isDaytime: false,
        temperature: 59, temperatureUnit: 'F', windSpeed: '5 mph', shortForecast: 'Partly Cloudy' },
      { number: 5, name: 'Monday', startTime: '2026-10-05T06:00:00-07:00', endTime: '2026-10-05T18:00:00-07:00', isDaytime: true,
        temperature: 28, temperatureUnit: 'C', windSpeed: '10 km/h', shortForecast: 'Slight Chance Rain Showers then Mostly Sunny' },
      { number: 6, name: 'Broken', startTime: 'soon', endTime: 'later', isDaytime: true, temperature: 999, shortForecast: 'Nonsense' },
    ],
  },
};

Deno.test('forecast: a day\'s high from its daytime period, the low from the night into that morning, the daytime words', () => {
  same(dayFromForecast(FORECAST, '2026-10-03', LA), { high: 78, low: 61, conditions: 'Mostly Sunny', byDay: true },
    'today: the morning has passed, so the low is the evening\'s');
  same(dayFromForecast(FORECAST, '2026-10-04', LA), { high: 82, low: 61, conditions: 'Sunny, Windy', byDay: true },
    'tomorrow: the low is the night before\'s; 25 mph is windy');
  same(dayFromForecast(FORECAST, '2026-10-05', LA), { high: 82, low: 59, conditions: 'Slight Chance Rain Showers then Mostly Sunny', byDay: true },
    'Celsius becomes Fahrenheit; 10 km/h is not windy');
  same(dayFromForecast(FORECAST, '2026-10-09', LA), null, 'a day the forecast does not reach');
  same(dayFromForecast({ properties: { periods: [] } }, '2026-10-03', LA), null, 'no periods');
  same(dayFromForecast({}, '2026-10-03', LA), null, 'an empty answer');
  same(dayFromForecast(null, '2026-10-03', LA), null, 'no answer');
});

Deno.test('forecast: in the evening only the night is left (a low, the night\'s words, not the working day\'s)', () => {
  const evening = { properties: { periods: [FORECAST.properties.periods[1]] } };
  same(dayFromForecast(evening, '2026-10-03', LA), { high: null, low: 61, conditions: 'Mostly Clear', byDay: false }, 'tonight only');
});

Deno.test('forecast: the day follows the job\'s zone, not the forecast\'s offset', () => {
  // The same Sunday daytime period, written in UTC: still Sunday Oct 4 in Los Angeles, already 1 PM there in UTC.
  const utc = { properties: { periods: [{ startTime: '2026-10-04T13:00:00+00:00', endTime: '2026-10-05T01:00:00+00:00', isDaytime: true,
    temperature: 82, temperatureUnit: 'F', windSpeed: '5 mph', shortForecast: 'Sunny' }] } };
  same(dayFromForecast(utc, '2026-10-04', LA)?.high, 82, 'Sunday in Los Angeles');
  same(dayFromForecast(utc, '2026-10-05', LA), null, 'not Monday');
});

function seen(timestamp: string, celsius: number | null, text: string, kmh: number | null = 8) {
  return {
    properties: {
      timestamp, textDescription: text,
      temperature: { unitCode: 'wmoUnit:degC', value: celsius },
      windSpeed: { unitCode: 'wmoUnit:km_h-1', value: kmh },
    },
  };
}

// A station on Friday Oct 2 in Los Angeles (UTC-7), newest first as the NWS sends them, with its neighbours' days.
const OBSERVED = {
  features: [
    seen('2026-10-03T07:53:00+00:00', 5, 'Clear'), // 12:53 AM Saturday: not Friday
    seen('2026-10-03T06:53:00+00:00', 13.9, 'Clear'), // 11:53 PM Friday: the low
    seen('2026-10-03T03:53:00+00:00', 17.2, 'Clear'),
    seen('2026-10-02T22:53:00+00:00', 25.6, 'Clear'), // 3:53 PM: the high
    seen('2026-10-02T19:53:00+00:00', 22.2, 'Mostly Cloudy', 35), // 12:53 PM, 35 km/h = 21.7 mph
    seen('2026-10-02T18:53:00+00:00', null, ''),
    seen('2026-10-02T16:53:00+00:00', 18.3, 'Mostly Cloudy'),
    seen('2026-10-02T13:53:00+00:00', 14.4, 'Fog/Mist'), // 6:53 AM
    seen('2026-10-02T06:53:00+00:00', 40, 'Clear'), // 11:53 PM Thursday: not Friday
    { properties: { timestamp: 'never', temperature: { value: 60 } } },
  ],
};

Deno.test('observations: the highest and lowest of that local day in °F; the words seen most at work; windy', () => {
  same(dayFromObservations(OBSERVED, '2026-10-02', LA), { high: 78, low: 57, conditions: 'Mostly Cloudy, Windy', byDay: true }, 'Friday');
  same(dayFromObservations(OBSERVED, '2026-10-03', LA), { high: 41, low: 41, conditions: 'Clear', byDay: false },
    'Saturday so far: one reading at night (its words are not the working day\'s)');
  same(dayFromObservations(OBSERVED, '2026-09-30', LA), null, 'a day the station has nothing for');
  same(dayFromObservations({ features: [] }, '2026-10-02', LA), null, 'no observations');
  same(dayFromObservations(null, '2026-10-02', LA), null, 'no answer');
});

Deno.test('observations: rain at work is said even when it is not what was seen most; Fahrenheit and mph stations are read as they are', () => {
  const rainy = { features: [
    seen('2026-10-02T15:53:00+00:00', 15, 'Overcast'), seen('2026-10-02T16:53:00+00:00', 15, 'Light Rain'),
    seen('2026-10-02T17:53:00+00:00', 16, 'Overcast'), seen('2026-10-02T18:53:00+00:00', 16, 'Overcast'),
  ] };
  same(dayFromObservations(rainy, '2026-10-02', LA)?.conditions, 'Overcast, Rain', 'rain added');
  const us = { features: [{ properties: { timestamp: '2026-10-02T19:00:00+00:00', textDescription: 'Fair',
    temperature: { unitCode: 'wmoUnit:degF', value: 71.6 }, windSpeed: { unitCode: 'wmoUnit:mi_h-1', value: 22 } } }] };
  same(dayFromObservations(us, '2026-10-02', LA), { high: 72, low: 72, conditions: 'Fair, Windy', byDay: true }, 'no conversion');
  const broken = { features: [seen('2026-10-02T19:00:00+00:00', 500, '')] };
  same(dayFromObservations(broken, '2026-10-02', LA), null, 'a broken sensor is not weather');
});

Deno.test('today: the higher high, the low that was seen, what was seen at work then the forecast\'s daytime words', () => {
  const ahead = { high: 78, low: 61, conditions: 'Mostly Sunny', byDay: true };
  same(todayFrom(ahead, { high: 66, low: 57, conditions: 'Light Rain', byDay: true }),
    { high: 78, low: 57, conditions: 'Light Rain then Mostly Sunny', byDay: true }, 'both');
  same(todayFrom(ahead, { high: 80, low: 57, conditions: 'Mostly Sunny', byDay: true }),
    { high: 80, low: 57, conditions: 'Mostly Sunny', byDay: true }, 'the same words are said once; what was seen is higher');
  same(todayFrom(ahead, { high: 58, low: 57, conditions: 'Clear', byDay: false }),
    { high: 78, low: 57, conditions: 'Mostly Sunny', byDay: true }, 'early: the night\'s words are left out');
  same(todayFrom({ high: null, low: 61, conditions: 'Mostly Clear', byDay: false }, { high: 79, low: 57, conditions: 'Sunny', byDay: true }),
    { high: 79, low: 57, conditions: 'Sunny', byDay: true }, 'evening: the day as seen');
  same(todayFrom(ahead, null), ahead, 'no station');
  same(todayFrom(null, null), null, 'nothing');
});

const BUTTONS = ['Clear', 'Cloudy', 'Rain', 'Wind', 'Fog', 'Heat', 'Cold'];

Deno.test('the form\'s own buttons: ticked from the words and the temperatures, in the form\'s order', () => {
  const picks = (conditions: string, high: number | null = 70, low: number | null = 55) => weatherPicks(BUTTONS, { conditions, high, low });
  same(picks('Mostly Sunny'), 'Clear', 'mostly sunny');
  same(picks('Sunny, Windy'), 'Clear, Wind', 'windy');
  same(picks('Partly Cloudy'), 'Cloudy', 'partly cloudy');
  same(picks('A Few Clouds'), 'Clear', 'a few clouds');
  same(picks('Slight Chance Rain Showers then Mostly Sunny'), 'Clear', 'a slight chance is not rain');
  same(picks('Chance Showers And Thunderstorms'), 'Rain', 'showers');
  same(picks('Mostly Cloudy, Rain, Windy'), 'Cloudy, Rain, Wind', 'three at once');
  same(picks('Light Rain then Mostly Sunny'), 'Clear, Rain', 'the form\'s order, not the day\'s');
  same(picks('Fog/Mist'), 'Fog', 'fog');
  same(picks('Clear', 101, 70), 'Clear, Heat', 'a high of 95 or more is heat');
  same(picks('Clear', 45, 28), 'Clear, Cold', 'a low of 32 or less is cold');
  same(picks('Light Snow', 40, 35), '', 'no button for snow on this form');
  same(picks(''), '', 'no words');
  same(weatherPicks(['Smoke', 'Sunny', 'Raining'], { conditions: 'Light Rain then Mostly Sunny', high: 70, low: 55 }), 'Sunny, Raining',
    'a company\'s own labels, as far as they are known');
  same(weatherPicks([], { conditions: 'Sunny', high: 70, low: 55 }), '', 'no buttons');
});

Deno.test('one line for a free-text weather box', () => {
  same(weatherLine({ conditions: 'Mostly Sunny', high: 78, low: 61 }), 'Mostly Sunny, high 78°F, low 61°F', 'all three');
  same(weatherLine({ conditions: '', high: null, low: 61 }), 'low 61°F', 'a low alone');
  same(weatherLine({ conditions: 'Fog', high: null, low: null }), 'Fog', 'words alone');
});
