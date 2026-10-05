// Weather for a daily (migration 0071; SPEC §18.1 principle 5: "the job is typed once ... weather is automatic").
// Signed-in users only; a missing WEATHER_USER_AGENT refuses every request (the NWS requires one).
//   weather: { project_id, day, options? } → { weather: { high, low, conditions, source } } or { weather: null, reason }.
//            requireUser → requireCapability('dailies.write') AS THE CALLER → the job, its place and the stored weather
//            are read AS THE CALLER (RLS: members) → a job with no place yet has its address looked up once with the US
//            Census geocoder and the answer stored (the first match, or that there is none: never a guess) → the stored
//            day when it is still right (what a station observed is final; today's is read again after an hour, a
//            coming day's after three; a moved location is read again) → else the National Weather Service
//            (_shared/weatherFetch.ts) and the answer stored. `options` are a form's condition buttons: the conditions
//            come back as the ones the weather ticks ("Clear, Wind"); without them, in plain words.
//            "No weather" (a job with no address or no match, a day the NWS has nothing for, a service that is down or
//            slow) is an answer, logged, never an error: the daily goes on and the boxes stay empty.
//   locate:  { project_id } → { matched }. requireCapability('project.manage') AS THE CALLER → the job's address is
//            looked up again and a match replaces what is stored, a typed location too ("Look up again" in Settings).
//            No match leaves a typed location alone. Here a geocoder that does not answer is a refusal, not a 200.
// Service client (admin_service_key_allowlist.txt): the two stores (project_place_store, project_weather_store: server
// only, nobody writes those tables by hand) and the rate-limit buckets, each after the caller-run capability check.
import { handle, HttpError, ok, refuse } from '../_shared/http.ts';
import { type Db, must, rpc, serviceClient } from '../_shared/db.ts';
import { requireCapability, requireUser } from '../_shared/auth.ts';
import { env } from '../_shared/env.ts';
import { limit } from '../_shared/ratelimit.ts';
import { parseJson, uuid, z } from '../_shared/validate.ts';
import { addressKey, dayDiff, type DayWeather, isDay, localDay, type Place, samePlace, weatherPicks } from '../_shared/weather.ts';
import { geocode, type WeatherCalls, weatherFor, WeatherUnavailable } from '../_shared/weatherFetch.ts';

const Body = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('weather'),
    project_id: uuid,
    day: z.string().refine(isDay, 'Not a day'),
    options: z.array(z.string().min(1).max(60)).max(30).optional(),
  }).strict(),
  z.object({ action: z.literal('locate'), project_id: uuid }).strict(),
]);

/** The whole request's budget for outside calls: past it the answer is "no weather". */
const BUDGET_MS = 15_000;
/** How long a stored forecast answers before it is read again: today's, and a coming day's. */
const TODAY_FRESH_MS = 60 * 60 * 1000;
const AHEAD_FRESH_MS = 3 * 60 * 60 * 1000;

type Project = { id: string; address: string | null; timezone: string };
type PlaceRow = { lat: number | null; lon: number | null; source: string; looked_up: string };
type WeatherRow = { high_f: number | null; low_f: number | null; conditions: string; source: DayWeather['source']; lat: number; lon: number; fetched_at: string };
type NoWeather = 'no_address' | 'no_match' | 'unavailable' | 'none';

async function loadProject(client: Db, projectId: string): Promise<Project> {
  const project = must(
    await client.from('projects').select('id, address, timezone').eq('id', projectId).is('deleted_at', null).maybeSingle(),
    'project lookup',
  ) as Project | null;
  if (!project) throw new HttpError(404, 'Job not found');
  return project;
}

async function loadPlace(client: Db, projectId: string): Promise<PlaceRow | null> {
  return must(
    await client.from('project_places').select('lat, lon, source, looked_up').eq('project_id', projectId).maybeSingle(),
    'place lookup',
  ) as PlaceRow | null;
}

function placeOf(row: PlaceRow | null): Place | null {
  return row && row.lat !== null && row.lon !== null ? { lat: row.lat, lon: row.lon } : null;
}

/** Outside calls are counted per person and per job, so nobody can make the server hammer the two services. */
async function countCall(service: Db, userId: string, projectId: string): Promise<void> {
  await limit(service, `job-weather:user:${userId}`, 60, 60 / 3600);
  await limit(service, `job-weather:project:${projectId}`, 240, 240 / 3600);
}

/** Looks the address up and stores the answer. Null when the geocoder did not answer (logged). */
async function lookUp(service: Db, calls: WeatherCalls, project: Project, key: string, again: boolean): Promise<{ place: Place | null } | null> {
  let match: Awaited<ReturnType<typeof geocode>>;
  try {
    match = await geocode(calls, key);
  } catch (e) {
    if (!(e instanceof WeatherUnavailable)) throw e;
    console.warn(`job-weather: the address of job ${project.id} was not looked up: ${e.message}`);
    return null;
  }
  // A match replaces a typed location only when the person asked for the lookup; no match never does.
  await rpc<boolean>(service, 'project_place_store', {
    p_project_id: project.id, p_lat: match?.lat ?? null, p_lon: match?.lon ?? null, p_matched: match?.matched ?? '',
    p_address: key, p_replace_typed: again && match !== null,
  });
  return { place: match ? { lat: match.lat, lon: match.lon } : null };
}

/** Where the job is: the typed location, the stored lookup of its address as it reads now, or a lookup made here. */
async function findPlace(
  client: Db, service: Db, calls: WeatherCalls, userId: string, project: Project,
): Promise<{ place: Place } | { place: null; reason: NoWeather }> {
  const row = await loadPlace(client, project.id);
  const typed = row?.source === 'typed' ? placeOf(row) : null;
  if (typed) return { place: typed };
  const key = addressKey(project.address);
  if (key === '') return { place: null, reason: 'no_address' };
  if (row && row.looked_up === key) {
    const stored = placeOf(row);
    return stored ? { place: stored } : { place: null, reason: 'no_match' };
  }
  await countCall(service, userId, project.id);
  const looked = await lookUp(service, calls, project, key, false);
  if (!looked) return { place: null, reason: 'unavailable' };
  // Someone may have typed the location meanwhile (the store leaves a typed one alone): what is stored now answers.
  const now = placeOf(await loadPlace(client, project.id));
  return now ? { place: now } : { place: null, reason: 'no_match' };
}

/** A stored day still answers: what was observed is final; a forecast for today or a coming day while it is recent. */
function fresh(row: WeatherRow, diff: number, now: number): boolean {
  if (row.source === 'nws_observed') return true;
  if (diff < 0) return false;
  return now - Date.parse(row.fetched_at) < (diff === 0 ? TODAY_FRESH_MS : AHEAD_FRESH_MS);
}

function answer(wx: Pick<DayWeather, 'high' | 'low' | 'conditions' | 'source'>, options: readonly string[] | undefined) {
  return {
    weather: { high: wx.high, low: wx.low, conditions: options ? weatherPicks(options, wx) : wx.conditions, source: wx.source },
  };
}

Deno.serve(handle(async (req) => {
  const { user, client } = await requireUser(req);
  // The NWS requires a User-Agent that says who is calling: without one, refuse (never call without it).
  const userAgent = env('WEATHER_USER_AGENT');
  const body = await parseJson(req, Body, 4096);
  const now = Date.now();
  const calls: WeatherCalls = { fetch: (url, init) => fetch(url, init), userAgent, deadline: now + BUDGET_MS, now: () => Date.now() };

  if (body.action === 'locate') {
    await requireCapability(client, body.project_id, 'project.manage');
    const project = await loadProject(client, body.project_id);
    const key = addressKey(project.address);
    if (key === '') return refuse(req, 400, 'no_address', 'Type the job\'s address first.');
    const service = serviceClient();
    await countCall(service, user.id, project.id);
    const looked = await lookUp(service, calls, project, key, true);
    if (!looked) return refuse(req, 409, 'unavailable', 'The address lookup did not answer. Try again.');
    return ok(req, { matched: looked.place !== null });
  }

  await requireCapability(client, body.project_id, 'dailies.write');
  const project = await loadProject(client, body.project_id);
  // Every check above ran as the caller. The service client makes the two server-only writes and counts the calls.
  const service = serviceClient();
  const found = await findPlace(client, service, calls, user.id, project);
  if (!found.place) return ok(req, { weather: null, reason: found.reason });
  const place = found.place;

  const stored = must(
    await client.from('project_weather').select('high_f, low_f, conditions, source, lat, lon, fetched_at')
      .eq('project_id', project.id).eq('day', body.day).maybeSingle(),
    'weather lookup',
  ) as WeatherRow | null;
  const mine = stored && samePlace(stored, place) ? stored : null;
  const kept = mine ? { high: mine.high_f, low: mine.low_f, conditions: mine.conditions, source: mine.source } : null;

  let read: DayWeather | null = null;
  try {
    if (mine && kept && fresh(mine, dayDiff(body.day, localDay(now, project.timezone)), now)) return ok(req, answer(kept, body.options));
    await countCall(service, user.id, project.id);
    read = await weatherFor(calls, place, body.day, project.timezone);
  } catch (e) {
    // A service that is down or slow, or a time zone this runtime does not know: no weather, never a failed daily.
    if (!(e instanceof WeatherUnavailable) && !(e instanceof RangeError)) throw e;
    console.warn(`job-weather: no weather for job ${project.id} on ${body.day}: ${e.message}`);
    return ok(req, kept ? answer(kept, body.options) : { weather: null, reason: 'unavailable' });
  }
  if (!read) return ok(req, kept ? answer(kept, body.options) : { weather: null, reason: 'none' });
  await rpc<boolean>(service, 'project_weather_store', {
    p_project_id: project.id, p_day: body.day, p_high_f: read.high, p_low_f: read.low, p_conditions: read.conditions,
    p_source: read.source, p_lat: place.lat, p_lon: place.lon,
  });
  return ok(req, answer(read, body.options));
}));
