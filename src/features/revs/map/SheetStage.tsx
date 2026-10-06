// The sheet in its frame: pdf.js underneath (or a picture: a room's cropped plan, 0083), the marks on top, both moved by
// one pan/zoom transform. Starts with the whole page in view (or zoomed in on `focus`); "Fit" comes back to it. Pinch,
// wheel or drag, and + / - / Fit always there, phones too (Jesse, Oct 5: "I need a zoom button on there on the
// viewers"; + and - keys too). The Revs plan (0059) adds an overlay that keeps its size on screen (the walls' lines and
// callouts, drawn where each page point is now) and taps.
import { useEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from 'react';
import { Maximize, Minus, Plus } from 'lucide-react';
import { HIGHLIGHT_WIDTH, type MarkupColor, type Stroke } from '../../../lib/markup';
import type { PDFPageProxy } from '../../../lib/pdf/pdfjs';
import { Button } from '../../../ui/Button';
import { SheetCanvas } from './SheetCanvas';
import { LiveStroke, StrokeLayer } from './StrokeLayer';
import { useSheetGestures } from './useSheetGestures';
import { clampView, fitSize, fitView, MAX_ZOOM, toPage, viewOn, zoomAt, type Pt, type Size, type View } from './viewport';

/** Where a page point (fractions) is on screen now, and how many screen pixels one page width is. */
export interface PagePlace {
  toFrame: (p: readonly [number, number]) => [number, number];
  scale: number;
  frame: Size;
}

interface SheetStageProps {
  /** The PDF page drawn, or `image` (a picture's URL) instead. */
  page?: PDFPageProxy | undefined;
  image?: string | undefined;
  /** Page height / width, as viewed. */
  aspect: number;
  strokes: readonly Stroke[];
  /** The color one finger draws with; null: one finger pans. */
  pen: MarkupColor | null;
  onStroke: (points: [number, number][]) => void;
  onError: (e: unknown) => void;
  /** Over the sheet, the same size whatever the zoom; drawn with where each page point is now. */
  overlay?: ((place: PagePlace) => ReactNode) | undefined;
  /** A tap with the pen off: the page point (fractions) and where on screen. */
  onTap?: ((page: [number, number], at: Pt, place: PagePlace) => void) | undefined;
  /** Opens zoomed in on this part of the page (fractions), filling `fill` of the frame (half when not given). */
  focus?: { x: number; y: number; w: number; h: number; fill?: number | undefined } | null | undefined;
  /** Taps place points: a crosshair though the pen is off. */
  aiming?: boolean | undefined;
}

/** One + or - step. */
const STEP = 1.5;

interface ZoomBarProps {
  zoom: number;
  onZoom: (factor: number) => void;
  onFit: () => void;
}

/** + / - / Fit at the corner of the sheet, at every size (a pinch or the wheel does the same). Finger-sized. */
function ZoomBar({ zoom, onZoom, onFit }: ZoomBarProps) {
  return (
    <div className="absolute bottom-3 right-3 z-10 flex items-center gap-0.5 rounded-full bg-card p-1 shadow-pop" data-testid="sheet-zoom">
      <Button variant="quiet" icon={Minus} aria-label="Zoom out" title="Zoom out" className="!rounded-full" disabled={zoom <= 1.01} onClick={() => { onZoom(1 / STEP); }} />
      <Button variant="quiet" icon={Plus} aria-label="Zoom in" title="Zoom in" className="!rounded-full" disabled={zoom >= MAX_ZOOM - 0.01} onClick={() => { onZoom(STEP); }} />
      <Button variant="quiet" icon={Maximize} className="!rounded-full !px-3" data-testid="sheet-fit" disabled={zoom <= 1.01} onClick={onFit}>
        Fit
      </Button>
    </div>
  );
}

function useElementSize(ref: RefObject<HTMLElement | null>): Size {
  const [size, setSize] = useState<Size>({ w: 0, h: 0 });
  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const measure = () => {
      const w = el.clientWidth;
      const h = el.clientHeight;
      setSize((s) => (s.w === w && s.h === h ? s : { w, h }));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => {
      ro.disconnect();
    };
  }, [ref]);
  return size;
}

export function SheetStage({ page, image, aspect, strokes, pen, onStroke, onError, overlay, onTap, focus, aiming = false }: SheetStageProps) {
  const frameRef = useRef<HTMLDivElement>(null);
  const frame = useElementSize(frameRef);
  const fit = useMemo(() => fitSize(aspect, frame), [aspect, frame]);
  const [view, setView] = useState<View>({ x: 0, y: 0, z: 1 });
  // The focus already shown: a new one (another wall) zooms there once; the person's own pan and zoom stay after. Kept
  // as its numbers, so a caller's new object for the same box changes nothing.
  const focused = useRef('');
  const focusKey = focus ? [focus.x, focus.y, focus.w, focus.h, focus.fill ?? 0.5].join(',') : '';

  // A new frame size (a turned phone, a resized window): the whole page while at 1x, else the same view kept inside.
  useEffect(() => {
    const [x = 0, y = 0, w = 0, h = 0, fill = 0.5] = focusKey === '' ? [] : focusKey.split(',').map(Number);
    if (focusKey !== '' && fit.w > 0 && focused.current !== focusKey) {
      focused.current = focusKey;
      setView(viewOn({ x, y, w, h }, fit, frame, fill));
      return;
    }
    setView((v) => (v.z === 1 ? fitView(fit, frame) : clampView(v, fit, frame)));
  }, [fit, frame, focusKey]);

  const place: PagePlace = {
    toFrame: ([x, y]) => [view.x + x * fit.w * view.z, view.y + y * fit.h * view.z],
    scale: fit.w * view.z,
    frame,
  };
  const tap = onTap
    ? (at: Pt) => {
        onTap(toPage(view, fit, at.x, at.y), at, place);
      }
    : undefined;
  const { live, handlers } = useSheetGestures({ frameRef, fit, frame, view, setView, drawing: pen !== null, onStroke, onTap: tap });
  const zoomBy = (factor: number) => {
    setView((v) => zoomAt(v, frame.w / 2, frame.h / 2, factor, fit, frame));
  };
  const toFit = () => {
    setView(() => fitView(fit, frame));
  };

  return (
    <div className="relative min-h-0 flex-1">
      <div
        ref={frameRef}
        {...handlers}
        tabIndex={0}
        aria-label="Sheet"
        data-testid="sheet-frame"
        data-zoom={view.z.toFixed(2)}
        className={`absolute inset-0 touch-none select-none overflow-hidden bg-page outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent ${pen || aiming ? 'cursor-crosshair' : 'cursor-grab'}`}
        onKeyDown={(e) => {
          if (e.metaKey || e.ctrlKey || e.altKey) return;
          if (e.key === '+' || e.key === '=') zoomBy(STEP);
          else if (e.key === '-' || e.key === '_') zoomBy(1 / STEP);
          else if (e.key === '0') toFit();
          else return;
          e.preventDefault();
        }}
      >
        <div
          className="absolute left-0 top-0 origin-top-left bg-white shadow-card will-change-transform"
          style={{ width: fit.w, height: fit.h, transform: `translate(${String(view.x)}px, ${String(view.y)}px) scale(${String(view.z)})` }}
        >
          {page ? <SheetCanvas page={page} fit={fit} view={view} frame={frame} onError={onError} /> : null}
          {image !== undefined ? (
            <img
              src={image}
              alt=""
              draggable={false}
              className="absolute inset-0 h-full w-full select-none"
              data-testid="sheet-image"
              onError={() => {
                onError(new Error('The picture did not load.'));
              }}
            />
          ) : null}
          <StrokeLayer strokes={strokes} aspect={aspect} />
          {live && pen ? <LiveStroke points={live} color={pen} width={HIGHLIGHT_WIDTH} aspect={aspect} /> : null}
        </div>
        {overlay && fit.w > 0 ? <div className="pointer-events-none absolute inset-0">{overlay(place)}</div> : null}
      </div>
      <ZoomBar zoom={view.z} onZoom={zoomBy} onFit={toFit} />
    </div>
  );
}
