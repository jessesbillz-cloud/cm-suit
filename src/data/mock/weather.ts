// job-weather and project_places (0071) in the e2e mock, found the way the server finds them: a job's place is its
// typed location, else the lookup of its address as it reads now (made on the first ask and remembered, a miss too). The
// pretend geocoder matches every address but one with "nowhere" in it; the pretend weather service has the same
// synthetic day for every located job within six days of today. Kept in sessionStorage (not module state).
import { todayInZone } from '../../lib/dates';
import { addressKey, weatherPicks } from '../../lib/weather';
import { DataError } from '../errors';
import { FunctionError } from '../functions';
import type { DayWeather, JobPlace } from '../weather.types';
import { capability } from './bids';
import * as jobs from './jobs';
import { delay } from './store';

const KEY = 'e2e-mock-weather';
/** How far the pretend weather service reaches either way, in days (the server's DAYS_AHEAD / DAYS_BACK). */
const REACH_DAYS = 6;
const SAMPLE = { high: 78, low: 61, conditions: 'Mostly Sunny' } as const;
const NOT_LOOKED_UP: JobPlace = { lat: null, lon: null, matched_address: '', source: 'census', looked_up: '' };

function read(): Record<string, JobPlace> {
  const raw = window.sessionStorage.getItem(KEY);
  return raw === null ? {} : (JSON.parse(raw) as Record<string, JobPlace>);
}

function write(projectId: string, place: JobPlace): void {
  window.sessionStorage.setItem(KEY, JSON.stringify({ ...read(), [projectId]: place }));
}

function forbidden(cap: string): FunctionError {
  return new FunctionError(403, 'forbidden', `Not allowed (${cap})`, null, null);
}

/** The pretend geocoder's answer for an address. */
function lookUp(address: string): JobPlace {
  if (/nowhere/i.test(address)) return { ...NOT_LOOKED_UP, looked_up: address };
  return { lat: 33.1, lon: -117.1, matched_address: address.toUpperCase(), source: 'census', looked_up: address };
}

/** project_places as the mock user reads it. */
export async function place(projectId: string): Promise<JobPlace | null> {
  await delay();
  return read()[projectId] ?? null;
}

/** job-weather `weather`: null when the job has no address, no match, or the day is out of reach. */
export async function dayWeather(projectId: string, day: string, options: readonly string[] | null): Promise<DayWeather | null> {
  if (!(await capability('dailies.write'))) throw forbidden('dailies.write');
  const project = await jobs.project(projectId);
  const key = addressKey(project.address);
  const stored = read()[projectId];
  let at: JobPlace;
  if (stored !== undefined && (stored.source === 'typed' || (key !== '' && stored.looked_up === key))) at = stored;
  else {
    if (key === '') return null;
    at = lookUp(key);
    write(projectId, at);
  }
  if (at.lat === null) return null;
  const days = Math.round((Date.parse(day) - Date.parse(todayInZone(project.timezone))) / 86_400_000);
  if (Math.abs(days) > REACH_DAYS) return null;
  return {
    high: SAMPLE.high,
    low: SAMPLE.low,
    conditions: options === null ? SAMPLE.conditions : weatherPicks(options, SAMPLE),
    source: days < 0 ? 'nws_observed' : 'nws_forecast',
  };
}

/** job-weather `locate`: the address looked up again. A match replaces a typed location; no match leaves it. */
export async function locate(projectId: string): Promise<boolean> {
  if (!(await capability('project.manage'))) throw forbidden('project.manage');
  const key = addressKey((await jobs.project(projectId)).address);
  if (key === '') throw new FunctionError(400, 'no_address', "Type the job's address first.", null, null);
  const looked = lookUp(key);
  const matched = looked.lat !== null;
  if (matched || read()[projectId]?.source !== 'typed') write(projectId, looked);
  return matched;
}

/** project_place_set: the location typed by hand, or emptied (null) so the address is looked up again. */
export async function setPlace(projectId: string, at: { lat: number; lon: number } | null): Promise<void> {
  if (!(await capability('project.manage'))) throw new DataError("You don't have access to that.", '42501', null);
  if (at === null) {
    if (read()[projectId]) write(projectId, NOT_LOOKED_UP);
    return;
  }
  if (!(Math.abs(at.lat) <= 90 && Math.abs(at.lon) <= 180)) throw new DataError('That is not a latitude and a longitude.', '22023', null);
  write(projectId, { lat: at.lat, lon: at.lon, matched_address: '', source: 'typed', looked_up: '' });
}
