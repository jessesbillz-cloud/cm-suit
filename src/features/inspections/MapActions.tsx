// A request map's buttons. Drawing: Make map (the server's PDF of what is drawn, with the title and legend), then
// Download map (one click, its own filename). Looking: Download map alone (the server makes the map first when it is
// out of date). Edit map / Done for whoever may still draw. After the deputy signs a passed IR, the map is made again
// so it carries his signature and date.
import { Check, Download, FileOutput, Pencil } from 'lucide-react';
import { messageOf } from '../../data/errors';
import { useDownloadIrMap } from '../../data/irMap';
import { useRenderIrMap } from '../../data/revs.mutations';
import type { IrMapContext } from '../../data/revs.types';
import { Button } from '../../ui/Button';
import { useToast } from '../../ui/Toast';

interface MapActionsProps {
  ctx: IrMapContext;
  editing: boolean;
  /** Marks still saving. */
  busy: boolean;
  /** Edit map / Done, for whoever may draw here; null: no switch. */
  onToggle: (() => void) | null;
}

export function MapActions({ ctx, editing, busy, onToggle }: MapActionsProps) {
  const render = useRenderIrMap();
  const download = useDownloadIrMap();
  const toast = useToast();
  const marked = ctx.sheet_file_id !== null && ctx.strokes.length > 0;
  const made = ctx.map_file_id !== null && !ctx.stale;
  const failed = (what: string) => (e: unknown) => {
    toast.show({ tone: 'error', message: `${what}: ${messageOf(e)}` });
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      {editing ? (
        <Button
          variant={made ? 'secondary' : 'primary'}
          icon={FileOutput}
          disabled={!marked || busy || made}
          loading={render.isPending}
          data-testid="ir-map-make"
          onClick={() => {
            render.mutate(ctx.request_id, { onError: failed('Map not made') });
          }}
        >
          Make map
        </Button>
      ) : null}
      {marked ? (
        <Button
          variant={editing && made ? 'primary' : 'secondary'}
          icon={Download}
          disabled={busy || (editing && !made)}
          loading={download.isPending}
          data-testid="ir-map-download"
          onClick={() => {
            download.mutate(ctx.request_id, { onError: failed('Not downloaded') });
          }}
        >
          Download map
        </Button>
      ) : null}
      {onToggle ? (
        <Button variant="quiet" icon={editing ? Check : Pencil} disabled={busy} data-testid="ir-map-edit" onClick={onToggle}>
          {editing ? 'Done' : 'Edit map'}
        </Button>
      ) : null}
    </div>
  );
}

/** After the deputy signs a passed IR: the map again, now with his signature and date (ir-map stamps it). */
export function useSignedMap(): (requestId: string) => void {
  const render = useRenderIrMap();
  const toast = useToast();
  return (requestId) => {
    render.mutate(requestId, {
      onError: (e) => {
        toast.show({ tone: 'error', message: `Map not signed: ${messageOf(e)}` });
      },
    });
  };
}
