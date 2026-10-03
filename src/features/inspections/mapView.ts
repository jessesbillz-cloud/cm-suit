// An OFS request's map, whoever draws it: a member (ir_map_context, ir_map_save and the ir-map function) or a link
// visitor by the request's receipt (request-link map, map_save, sheet, map_render, map_download). One panel (MapPanel),
// one autosave (useMapAutosave) and one set of buttons (MapActions) serve both; each side hands in its own reads and
// writes in these shapes. Pure; tested in mapView.test.ts.
import type { PublicMap } from '../../data/requestNoLogin.types';
import type { IrMapContext } from '../../data/revs.types';
import type { MarkupColor, Stroke } from '../../lib/markup';

/** The map as the panel shows it. */
export interface MapView {
  sheetFileId: string | null;
  /** 1-based page of the sheet PDF. */
  page: number;
  strokes: Stroke[];
  legend: { color: MarkupColor; name: string }[];
  version: number;
  /** May I draw on it now. */
  canEdit: boolean;
  /** A map PDF is on file and shows what is drawn now. */
  made: boolean;
}

/** What is drawn, as one save sends it: the marks, the sheet and its page (the server keeps what didn't change). */
export interface Drawn {
  sheetFileId: string | null;
  page: number;
  strokes: Stroke[];
}

/** Saves what is drawn with the map's version; answers the map's next version. */
export type SaveMap = (v: Drawn & { version: number }) => Promise<number>;

/** A server step on the map (Make map, Download map). */
export interface MapAction {
  run: (onError: (e: unknown) => void) => void;
  pending: boolean;
}

/** Where the map's sheet comes from: any of the job's PDFs (a member), or one of the request's walls' sheets (the link). */
export type SheetChoice = { kind: 'job'; projectId: string } | { kind: 'walls'; sheets: { file_id: string; label: string }[] };

export function memberMapView(ctx: IrMapContext): MapView {
  return {
    sheetFileId: ctx.sheet_file_id, page: ctx.page, strokes: ctx.strokes, legend: ctx.legend, version: ctx.version,
    canEdit: ctx.can_edit, made: ctx.map_file_id !== null && !ctx.stale,
  };
}

export function publicMapView(m: PublicMap): MapView {
  return {
    sheetFileId: m.sheet_file_id, page: m.page, strokes: m.strokes, legend: m.legend, version: m.version, canEdit: m.can_edit,
    made: m.has_map && !m.stale,
  };
}
