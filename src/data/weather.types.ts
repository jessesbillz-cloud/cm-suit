// Weather on dailies (migration 0071; edge function job-weather): the answers pinned with zod at the boundary, and the
// job's place as the app reads it.
import { z } from 'zod';
import type { Tables } from './database.types';

/** A day's weather at the job, or null when there is none (no address, no match, nothing for that day, a service down). */
export const dayWeatherSchema = z.object({
  weather: z
    .object({
      /** °F. */
      high: z.number().int().nullable(),
      low: z.number().int().nullable(),
      /** The form's own condition buttons this weather ticks ("Clear, Wind") when they were sent; else plain words. */
      conditions: z.string(),
      source: z.enum(['nws_forecast', 'nws_observed']),
    })
    .nullable(),
});
export type DayWeather = NonNullable<z.output<typeof dayWeatherSchema>['weather']>;

/** "Look up again": whether the job's address matched. */
export const locatedSchema = z.object({ matched: z.boolean() });

/** Where the job is: looked up from its address (no coordinates = no match) or typed. */
export type JobPlace = Pick<Tables<'project_places'>, 'lat' | 'lon' | 'matched_address' | 'source' | 'looked_up'>;

export const PLACE_COLS = 'lat, lon, matched_address, source, looked_up';
