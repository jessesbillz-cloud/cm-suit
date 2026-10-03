// A request map's buttons, for a member and a link visitor alike (the caller hands in its Make map and Download map).
// Drawing: Make map (the server's PDF of what is drawn, with the title and legend), then Download map (one click, its
// own filename). Looking: Download map alone (the server makes the map first when it is out of date). Edit map / Done
// for whoever may still draw. After the deputy signs a passed IR, the map is made again so it carries his signature
// and date.
import { Check, Download, FileOutput, Pencil } from 'lucide-react';
import { messageOf } from '../../data/errors';
import { useRenderIrMap } from '../../data/revs.mutations';
import { Button } from '../../ui/Button';
import { useToast } from '../../ui/Toast';
import type { MapAction } from './mapView';

interface MapActionsProps {
  /** A sheet with marks on it: something to make a map of. */
  marked: boolean;
  /** The map PDF on file shows what is drawn now. */
  made: boolean;
  editing: boolean;
  /** Marks still saving. */
  busy: boolean;
  make: MapAction;
  download: MapAction;
  /** Edit map / Done, for whoever may draw here; null: no switch. */
  onToggle: (() => void) | null;
}

export function MapActions({ marked, made, editing, busy, make, download, onToggle }: MapActionsProps) {
  const toast = useToast();
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
          loading={make.pending}
          data-testid="ir-map-make"
          onClick={() => {
            make.run(failed('Map not made'));
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
          loading={download.pending}
          data-testid="ir-map-download"
          onClick={() => {
            download.run(failed('Not downloaded'));
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
