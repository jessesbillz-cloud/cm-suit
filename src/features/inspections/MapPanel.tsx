// An OFS request's map (OSFM: one map per IR, the inspected walls highlighted on the plan sheet in the legend's colors),
// for a member (IrMap) and a link visitor (PublicMap) alike: each hands in its map, its sheet's URL, its save, and its
// Make map and Download map. Open for drawing right after sending; else read-only, with Edit map for whoever may still
// draw. The marks save themselves. Drawing also picks the sheet (a member: any of the job's PDFs; a visitor: one of the
// request's walls' sheets) and, on a PDF of several pages (a plan set kept as one file), the page.
import { useCallback, useState } from 'react';
import type { UseQueryResult } from '@tanstack/react-query';
import type { Stroke } from '../../lib/markup';
import { Button } from '../../ui/Button';
import { FIELD_LABEL } from '../../ui/Fields';
import { SaveState } from '../../ui/SaveState';
import { ErrorState, LoadingState } from '../../ui/States';
import { SheetMarkup } from '../revs/map/SheetMarkup';
import { SheetPicker } from '../revs/SheetPicker';
import { ChoiceRow } from './ChoiceRow';
import { MapActions } from './MapActions';
import { sheetOptions } from './mapSheets';
import type { Drawn, MapAction, MapView, SaveMap, SheetChoice } from './mapView';
import { PagePicker } from './PagePicker';
import { useMapAutosave } from './useMapAutosave';

/** The sheet's frame (a fixed height): most of a phone's screen to draw on, less to look at. */
const FRAME = 'overflow-hidden rounded-lg border border-line';
const FRAME_DRAW = `${FRAME} h-[70dvh] min-h-[360px] sm:h-[520px]`;
const FRAME_LOOK = `${FRAME} h-[52dvh] min-h-[280px] sm:h-[380px]`;

interface MapSheetProps {
  url: UseQueryResult<string, unknown>;
  /** The URL is the saved sheet's: false while another sheet is being saved. */
  current: boolean;
  drawn: Drawn;
  legend: MapView['legend'];
  readOnly: boolean;
  onChange: (strokes: Stroke[]) => void;
  onPages: (pages: number) => void;
}

function MapSheet({ url, current, drawn, legend, readOnly, onChange, onPages }: MapSheetProps) {
  if (url.isError) {
    return <ErrorState error={url.error} title="The sheet did not open." onRetry={() => void url.refetch()} className="m-0" />;
  }
  return (
    <div className={readOnly ? FRAME_LOOK : FRAME_DRAW} data-testid="ir-map-sheet">
      {url.isPending || !current ? (
        <LoadingState label="Opening sheet" />
      ) : (
        <SheetMarkup
          sheetUrl={url.data}
          page={drawn.page}
          strokes={drawn.strokes}
          items={legend}
          readOnly={readOnly}
          onChange={onChange}
          onPages={onPages}
        />
      )}
    </div>
  );
}

interface SheetRowProps {
  choice: SheetChoice;
  value: string | null;
  onPick: (fileId: string) => void;
}

/** A member picks from the job's PDFs; a visitor from the request's walls' sheets (nothing to pick with one). */
function SheetRow({ choice, value, onPick }: SheetRowProps) {
  if (choice.kind === 'job') {
    return (
      <SheetPicker
        projectId={choice.projectId}
        value={value}
        onChange={(id) => {
          if (id !== null) onPick(id);
        }}
      />
    );
  }
  const options = sheetOptions(choice.sheets);
  if (options.length === 0 || (options.length === 1 && options[0]?.value === value)) return null;
  return (
    <div className="flex flex-col gap-1.5">
      <span className={FIELD_LABEL}>Sheet</span>
      <ChoiceRow label="Sheet" options={options} value={value} onPick={onPick} testId="map-sheet" large />
    </div>
  );
}

interface MapPanelProps {
  view: MapView;
  /** The saved sheet's short-lived URL. */
  sheetUrl: UseQueryResult<string, unknown>;
  save: SaveMap;
  make: MapAction;
  download: MapAction;
  /** Read the map again (after someone else's change). */
  reload: () => void;
  sheets: SheetChoice;
  /** Open for drawing (right after sending). */
  startEditing: boolean;
}

export function MapPanel({ view, sheetUrl, save, make, download, reload, sheets, startEditing }: MapPanelProps) {
  const [open, setOpen] = useState(startEditing);
  const editing = open && view.canEdit;
  const auto = useMapAutosave(view, save, reload);
  const sheet = auto.drawn.sheetFileId;
  // The PDF's page count, for the sheet it was read from.
  const [pages, setPages] = useState<{ sheet: string | null; count: number } | null>(null);
  const onPages = useCallback(
    (count: number) => {
      setPages({ sheet: view.sheetFileId, count });
    },
    [view.sheetFileId],
  );
  const pageCount = pages !== null && pages.sheet === sheet ? pages.count : 1;
  const picking = editing && sheets.kind === 'job';

  return (
    <div className="flex flex-col gap-2.5" data-testid="ir-map" data-editing={editing || undefined}>
      {editing ? <SheetRow choice={sheets} value={sheet} onPick={auto.setSheet} /> : null}
      {editing && pageCount > 1 ? <PagePicker page={auto.drawn.page} pages={pageCount} onPage={auto.setPage} /> : null}
      {sheet !== null ? (
        <MapSheet
          url={sheetUrl}
          current={sheet === view.sheetFileId}
          drawn={auto.drawn}
          legend={view.legend}
          readOnly={!editing}
          onChange={auto.change}
          onPages={onPages}
        />
      ) : picking ? null : (
        <p className="text-sm text-ink-2">No sheet yet.</p>
      )}
      {editing ? (
        <div className="flex min-h-5 items-center gap-2" data-testid="ir-map-save">
          <SaveState pending={auto.busy} saved={auto.saved} problem={auto.problem} />
          {auto.fix ? (
            <Button size="sm" onClick={auto.fix.run}>
              {auto.fix.label}
            </Button>
          ) : null}
        </div>
      ) : null}
      <MapActions
        marked={view.sheetFileId !== null && view.strokes.length > 0}
        made={view.made}
        editing={editing}
        busy={auto.busy}
        make={make}
        download={download}
        onToggle={
          view.canEdit && !startEditing
            ? () => {
                setOpen(!open);
              }
            : null
        }
      />
    </div>
  );
}
