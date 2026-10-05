// Weather on dailies (migration 0071). The day's weather comes from the edge function job-weather (the National Weather
// Service for the job's location, kept by the server); the job's place is read from project_places (RLS: members).
import { skipToken, useQuery } from '@tanstack/react-query';
import { supabase } from './client';
import { throwIfErrorMaybe } from './errors';
import { callFunction } from './functions';
import { qk } from './keys';
import { isMock } from './mock';
import * as mock from './mock/weather';
import { PLACE_COLS, dayWeatherSchema, type DayWeather, type JobPlace } from './weather.types';

/** How long an answer stands before a report asks again (the server keeps its own, longer memory). */
const ASK_AGAIN_MS = 10 * 60_000;

/**
 * The weather at the job on a day, or null when there is none. `options` are the form's condition buttons: the
 * conditions come back as the ones the weather ticks; without them, in plain words. Asked only while `enabled` (an open
 * draft whose weather is still the app's to fill). Not retried: no weather just leaves the boxes empty.
 */
export function useDayWeather(projectId: string, day: string, options: readonly string[] | null, enabled: boolean) {
  return useQuery({
    queryKey: qk.dayWeather(projectId, day, options === null ? '' : options.join('|')),
    queryFn: enabled
      ? async (): Promise<DayWeather | null> => {
          if (isMock()) return mock.dayWeather(projectId, day, options);
          const body = { action: 'weather', project_id: projectId, day, ...(options === null ? {} : { options }) };
          return (await callFunction('job-weather', body, dayWeatherSchema)).weather;
        }
      : skipToken,
    staleTime: ASK_AGAIN_MS,
    retry: false,
  });
}

/** Where the job is, or null before its address was ever looked up. */
export function useJobPlace(projectId: string) {
  return useQuery({
    queryKey: qk.jobPlace(projectId),
    queryFn: async (): Promise<JobPlace | null> =>
      isMock()
        ? mock.place(projectId)
        : throwIfErrorMaybe(await supabase.from('project_places').select(PLACE_COLS).eq('project_id', projectId).maybeSingle()),
  });
}
