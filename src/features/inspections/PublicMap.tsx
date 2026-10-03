// A link visitor's map, by the request's private receipt (0057): the one map panel (MapPanel) with the receipt's reads
// and writes (request-link map, map_save, sheet, map_render, map_download). Right after sending it opens for drawing;
// on the status link it shows read-only with Download map, and Edit map until the inspector records a result. The
// sheet is one of the request's walls' sheets. A section of the request's card; a request without walls has no map.
import { useDownloadPublicMap, usePublicMap, usePublicSheetUrl, useRenderPublicMap, useSavePublicMap } from '../../data/requestNoLoginRevs';
import { ErrorState, LoadingState } from '../../ui/States';
import { MapPanel } from './MapPanel';
import { publicMapView } from './mapView';

interface PublicMapProps {
  projectId: string;
  receipt: string;
  /** Open for drawing (right after sending a request with walls). */
  editing?: boolean | undefined;
}

export function PublicMap({ projectId, receipt, editing = false }: PublicMapProps) {
  const map = usePublicMap(projectId, receipt);
  const url = usePublicSheetUrl(projectId, receipt, map.data?.sheet_file_id ?? null);
  const save = useSavePublicMap(projectId, receipt);
  const render = useRenderPublicMap(projectId, receipt);
  const download = useDownloadPublicMap(projectId, receipt);
  // No walls, no map. On the status link a request may have none, so nothing shows until the answer says.
  if (map.data === null || (map.isPending && !editing)) return null;
  // A failed refetch (the map refreshes while on screen) keeps the map and what is being drawn.
  return (
    <section className="flex flex-col gap-2.5 border-t border-line pt-3" aria-label="Map" data-testid="public-map">
      <h3 className="text-[15px] font-semibold leading-6 text-ink">Map</h3>
      {map.data === undefined ? (
        map.isError ? (
          <ErrorState error={map.error} title="The map did not load." onRetry={() => void map.refetch()} className="m-0" />
        ) : (
          <LoadingState label="Loading the map" />
        )
      ) : (
        <MapPanel
          view={publicMapView(map.data)}
          sheetUrl={url}
          save={async (v) => {
            const next = await save.mutateAsync(v);
            if (next === null) throw new Error('This request has no map.');
            return next.version;
          }}
          make={{
            run: (onError) => {
              render.mutate(undefined, { onError });
            },
            pending: render.isPending,
          }}
          download={{
            run: (onError) => {
              download.mutate(undefined, { onError });
            },
            pending: download.isPending,
          }}
          reload={() => void map.refetch()}
          sheets={{ kind: 'walls', sheets: map.data.sheets }}
          startEditing={editing}
        />
      )}
    </section>
  );
}
