// An OFS request's map (OSFM: one map per IR, the inspected walls highlighted on the plan sheet in the legend's colors).
// Right after sending it opens for drawing; on the request it opens read-only, with Edit map for whoever may still draw
// (the requester before a result, an inspector; nobody once signed). The marks save themselves. No sheet yet: pick one
// from the job's files.
import { useState } from 'react';
import { useIrMap } from '../../data/revs.queries';
import type { IrMapContext } from '../../data/revs.types';
import { useSheetUrl } from '../../data/sheetUrl';
import type { Stroke } from '../../lib/markup';
import { Button } from '../../ui/Button';
import { SaveState } from '../../ui/SaveState';
import { ErrorState, LoadingState } from '../../ui/States';
import { SheetMarkup } from '../revs/map/SheetMarkup';
import { MapActions } from './MapActions';
import { SheetField } from './SheetField';
import { useMapAutosave } from './useMapAutosave';

interface IrMapProps {
  requestId: string;
  projectId: string;
  /** Open for drawing (right after sending). */
  editing?: boolean | undefined;
}

/** The sheet's frame (a fixed height): most of a phone's screen to draw on, less to look at. */
const FRAME = 'overflow-hidden rounded-lg border border-line';
const FRAME_DRAW = `${FRAME} h-[70dvh] min-h-[360px] sm:h-[520px]`;
const FRAME_LOOK = `${FRAME} h-[52dvh] min-h-[280px] sm:h-[380px]`;

interface MapSheetProps {
  ctx: IrMapContext;
  strokes: Stroke[];
  readOnly: boolean;
  onChange: (strokes: Stroke[]) => void;
}

function MapSheet({ ctx, strokes, readOnly, onChange }: MapSheetProps) {
  const url = useSheetUrl(ctx.request_id, ctx.sheet_file_id);
  if (url.isError) {
    return <ErrorState error={url.error} title="The sheet did not open." onRetry={() => void url.refetch()} className="m-0" />;
  }
  return (
    <div className={readOnly ? FRAME_LOOK : FRAME_DRAW} data-testid="ir-map-sheet">
      {url.isPending ? (
        <LoadingState label="Opening sheet" />
      ) : (
        <SheetMarkup sheetUrl={url.data} page={ctx.page} strokes={strokes} items={ctx.legend} readOnly={readOnly} onChange={onChange} />
      )}
    </div>
  );
}

interface MapBodyProps {
  ctx: IrMapContext;
  projectId: string;
  startEditing: boolean;
  reload: () => void;
}

function MapBody({ ctx, projectId, startEditing, reload }: MapBodyProps) {
  const [open, setOpen] = useState(startEditing);
  const editing = open && ctx.can_edit;
  const save = useMapAutosave(ctx, reload);
  return (
    <div className="flex flex-col gap-2.5" data-testid="ir-map" data-editing={editing || undefined}>
      {editing ? <SheetField projectId={projectId} value={ctx.sheet_file_id} onChange={save.setSheet} disabled={save.busy} /> : null}
      {ctx.sheet_file_id !== null ? (
        <MapSheet ctx={ctx} strokes={save.strokes} readOnly={!editing} onChange={save.change} />
      ) : editing ? null : (
        <p className="text-sm text-ink-2">No sheet yet.</p>
      )}
      {editing ? (
        <div className="flex min-h-5 items-center gap-2" data-testid="ir-map-save">
          <SaveState pending={save.busy} saved={save.saved} problem={save.problem} />
          {save.fix ? (
            <Button size="sm" onClick={save.fix.run}>
              {save.fix.label}
            </Button>
          ) : null}
        </div>
      ) : null}
      <MapActions
        ctx={ctx}
        editing={editing}
        busy={save.busy}
        onToggle={
          ctx.can_edit && !startEditing
            ? () => {
                setOpen(!open);
              }
            : null
        }
      />
    </div>
  );
}

export function IrMap({ requestId, projectId, editing = false }: IrMapProps) {
  const map = useIrMap(requestId);
  if (map.isError) {
    return <ErrorState error={map.error} title="The map did not load." onRetry={() => void map.refetch()} className="m-0" />;
  }
  if (map.isPending) return <LoadingState label="Loading the map" />;
  return <MapBody ctx={map.data} projectId={projectId} startEditing={editing} reload={() => void map.refetch()} />;
}
