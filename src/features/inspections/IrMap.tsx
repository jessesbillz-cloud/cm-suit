// A member's view of an OFS request's map (ir_map_context): right after sending it opens for drawing; on the request it
// opens read-only, with Edit map for whoever may still draw (the requester before a result, an inspector; nobody once
// signed). The one map panel (MapPanel) with the member's reads and writes: ir_map_save, the ir-map function's sheet,
// render and download, and any of the job's PDFs as the sheet. Whoever may draw also gets the request's walls as drawn
// on the plan in Revs (0059), so an empty map fills itself from them.
import { useDownloadIrMap } from '../../data/irMap';
import { useRenderIrMap, useSaveIrMap } from '../../data/revs.mutations';
import { useIrMap, useIrRevItems, useRevSetup } from '../../data/revs.queries';
import { useSheetUrl } from '../../data/sheetUrl';
import { ErrorState, LoadingState } from '../../ui/States';
import { MapPanel } from './MapPanel';
import { memberMapView } from './mapView';
import { mapWalls } from './wallStrokes';

interface IrMapProps {
  requestId: string;
  projectId: string;
  /** Open for drawing (right after sending). */
  editing?: boolean | undefined;
}

export function IrMap({ requestId, projectId, editing = false }: IrMapProps) {
  const map = useIrMap(requestId);
  const url = useSheetUrl(requestId, map.data?.sheet_file_id ?? null);
  const save = useSaveIrMap();
  const render = useRenderIrMap();
  const download = useDownloadIrMap();
  const drawing = map.data?.can_edit === true;
  const cells = useIrRevItems(drawing ? requestId : null);
  // The walls' lines on the plan: Revs' setup, read only by someone who may read revs (else it is empty).
  const setup = useRevSetup(projectId, drawing);
  const walls = cells.data && setup.data ? mapWalls(cells.data, setup.data.areas) : [];
  // A failed refetch (the map refreshes while on screen) keeps the map and what is being drawn.
  if (map.data === undefined) {
    return map.isError ? (
      <ErrorState error={map.error} title="The map did not load." onRetry={() => void map.refetch()} className="m-0" />
    ) : (
      <LoadingState label="Loading the map" />
    );
  }
  return (
    <MapPanel
      view={memberMapView(map.data)}
      sheetUrl={url}
      save={async (v) => (await save.mutateAsync({ requestId, ...v })).version}
      make={{
        run: (onError) => {
          render.mutate(requestId, { onError });
        },
        pending: render.isPending,
      }}
      download={{
        run: (onError) => {
          download.mutate(requestId, { onError });
        },
        pending: download.isPending,
      }}
      reload={() => void map.refetch()}
      sheets={{ kind: 'job', projectId }}
      startEditing={editing}
      walls={walls}
    />
  );
}
