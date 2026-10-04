// The job's location (migration 0071; project.manage): look the address up again (edge function job-weather), or type
// the latitude and longitude by hand / empty them (project_place_set). Either way the place is read again, and so is
// the weather asked for that job.
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from './client';
import { throwIfErrorMaybe } from './errors';
import { callFunction } from './functions';
import { qk } from './keys';
import { isMock } from './mock';
import * as mock from './mock/weather';
import { locatedSchema } from './weather.types';

function useRefresh(projectId: string) {
  const qc = useQueryClient();
  return async () => {
    await Promise.all([
      qc.invalidateQueries({ queryKey: qk.jobPlace(projectId) }),
      qc.invalidateQueries({ queryKey: qk.dayWeatherAll(projectId) }),
    ]);
  };
}

/** Looks the job's address up again. Resolves to whether it matched (a match replaces a typed location). */
export function useLocateJob(projectId: string) {
  const refresh = useRefresh(projectId);
  return useMutation({
    mutationFn: async (): Promise<boolean> =>
      isMock() ? mock.locate(projectId) : (await callFunction('job-weather', { action: 'locate', project_id: projectId }, locatedSchema)).matched,
    onSettled: refresh,
  });
}

/** Types the job's location, or empties it (null) so the address is looked up again. */
export function useSetJobPlace(projectId: string) {
  const refresh = useRefresh(projectId);
  return useMutation({
    mutationFn: async (at: { lat: number; lon: number } | null): Promise<void> => {
      if (isMock()) return mock.setPlace(projectId, at);
      throwIfErrorMaybe(
        await supabase.rpc('project_place_set', { p_project_id: projectId, ...(at === null ? {} : { p_lat: at.lat, p_lon: at.lon }) }),
      );
    },
    onSettled: refresh,
  });
}
