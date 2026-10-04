// Settings > Job: where the job is, for the weather on its dailies (migration 0071). The server looks the address up
// once; here a person with project.manage sees the match and can look it up again, or types the latitude and longitude
// when the address has no match (emptying them goes back to the lookup). An address not looked up yet (a new job, a
// changed address) is looked up as this row shows.
import { useEffect, useRef, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { messageOf } from '../../data/errors';
import { useLocateJob, useSetJobPlace } from '../../data/weather.mutations';
import { useJobPlace } from '../../data/weather.queries';
import type { JobPlace } from '../../data/weather.types';
import { addressKey } from '../../lib/weather';
import { Button } from '../../ui/Button';
import { FIELD_CONTROL } from '../../ui/Fields';
import { ErrorState } from '../../ui/States';
import { SettingRow } from './SettingRow';

/** A typed coordinate, or null when the box does not hold one. */
function coordinate(text: string, limit: number): number | null {
  const n = Number(text.trim());
  return text.trim() !== '' && Number.isFinite(n) && Math.abs(n) <= limit ? n : null;
}

interface TypedPlaceProps {
  /** The typed location now, or null. */
  typed: { lat: number; lon: number } | null;
  onSet: (at: { lat: number; lon: number } | null) => void;
  onProblem: (problem: string | null) => void;
}

/** Latitude and longitude, saved when both are in (on leaving a box); both emptied clears a typed location. */
function TypedPlace({ typed, onSet, onProblem }: TypedPlaceProps) {
  const [lat, setLat] = useState(typed === null ? '' : String(typed.lat));
  const [lon, setLon] = useState(typed === null ? '' : String(typed.lon));

  function commit() {
    onProblem(null);
    if (lat.trim() === '' && lon.trim() === '') {
      if (typed !== null) onSet(null);
      return;
    }
    if (lat.trim() === '' || lon.trim() === '') return;
    const at = { lat: coordinate(lat, 90), lon: coordinate(lon, 180) };
    if (at.lat === null || at.lon === null) {
      onProblem('Not a latitude and longitude.');
      return;
    }
    if (typed === null || typed.lat !== at.lat || typed.lon !== at.lon) onSet({ lat: at.lat, lon: at.lon });
  }

  return (
    <>
      <input
        aria-label="Latitude"
        placeholder="Latitude"
        inputMode="text"
        autoComplete="off"
        className={`${FIELD_CONTROL} w-32`}
        value={lat}
        data-testid="job-lat"
        onBlur={commit}
        onChange={(e) => {
          setLat(e.target.value);
        }}
      />
      <input
        aria-label="Longitude"
        placeholder="Longitude"
        inputMode="text"
        autoComplete="off"
        className={`${FIELD_CONTROL} w-32`}
        value={lon}
        data-testid="job-lon"
        onBlur={commit}
        onChange={(e) => {
          setLon(e.target.value);
        }}
      />
    </>
  );
}

function typedOf(row: JobPlace | null): { lat: number; lon: number } | null {
  return row !== null && row.source === 'typed' && row.lat !== null && row.lon !== null ? { lat: row.lat, lon: row.lon } : null;
}

interface JobLocationProps {
  projectId: string;
  /** The job's saved address. */
  address: string | null;
}

export function JobLocation({ projectId, address }: JobLocationProps) {
  const place = useJobPlace(projectId);
  const locate = useLocateJob(projectId);
  const set = useSetJobPlace(projectId);
  const [problem, setProblem] = useState<string | null>(null);
  const tried = useRef<string | null>(null);
  const key = addressKey(address);
  const row = place.data ?? null;
  const typed = typedOf(row);
  /** The stored lookup, when it is of the address as it reads now. */
  const lookedUp = row !== null && row.source !== 'typed' && key !== '' && row.looked_up === key ? row : null;
  /** The address as matched (its coordinates when the geocoder wrote none back). */
  const match =
    lookedUp === null || lookedUp.lat === null || lookedUp.lon === null
      ? null
      : lookedUp.matched_address !== ''
        ? lookedUp.matched_address
        : `${String(lookedUp.lat)}, ${String(lookedUp.lon)}`;
  const waiting = place.isSuccess && typed === null && lookedUp === null && key !== '';
  const lookUp = locate.mutate;

  useEffect(() => {
    // Not looked up yet: look it up now, once per address.
    if (!waiting || tried.current === key) return;
    tried.current = key;
    lookUp();
  }, [waiting, key, lookUp]);

  if (place.isError) {
    return (
      <SettingRow label="Location" testId="job-location">
        <ErrorState error={place.error} onRetry={() => void place.refetch()} className="m-0" />
      </SettingRow>
    );
  }
  // The address has no match: the stored lookup says so, or "Look up again" just did and the typed location stayed.
  const noMatch = (lookedUp !== null && match === null) || (typed !== null && locate.isSuccess && !locate.data);
  const failed = problem ?? (locate.isError ? messageOf(locate.error) : set.isError ? messageOf(set.error) : null);
  return (
    <SettingRow label="Location" testId="job-location">
      <div className="flex flex-wrap items-center gap-2">
        {match !== null ? (
          <span className="min-w-0 break-words text-sm text-ink" data-testid="job-location-match">
            {match}
          </span>
        ) : place.isSuccess && (!waiting || locate.isError) ? (
          // Not while the first lookup is on its way. Keyed on what is stored, so the boxes show a typed location as saved.
          <TypedPlace
            key={typed === null ? 'none' : `${String(typed.lat)},${String(typed.lon)}`}
            typed={typed}
            onProblem={setProblem}
            onSet={(at) => {
              // Emptied: the address may be looked up again.
              if (at === null) tried.current = null;
              set.mutate(at);
            }}
          />
        ) : null}
        {place.isPending ? (
          <span role="status" className="text-sm text-ink-2">
            Loading...
          </span>
        ) : null}
        {noMatch ? (
          <span className="text-sm text-ink-2" data-testid="job-location-none">
            No match
          </span>
        ) : null}
        {key !== '' && place.isSuccess ? (
          <Button
            size="sm"
            icon={RefreshCw}
            loading={locate.isPending}
            data-testid="job-location-lookup"
            onClick={() => {
              setProblem(null);
              lookUp();
            }}
          >
            Look up again
          </Button>
        ) : null}
      </div>
      {failed !== null ? (
        <p role="alert" className="mt-1 text-sm text-danger">
          {failed}
        </p>
      ) : null}
    </SettingRow>
  );
}
