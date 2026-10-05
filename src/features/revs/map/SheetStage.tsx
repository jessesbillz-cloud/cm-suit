// The sheet in its frame: pdf.js underneath, the marks on top, both moved by one pan/zoom transform. Starts with the
// whole page in view (or zoomed in on `focus`); "Fit" comes back to it. The Revs plan (0059) adds an overlay that keeps
// its size on screen (the walls' lines and callouts, drawn where each page point is now) and taps.
import { useEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from 'react';
import { HIGHLIGHT_WIDTH, type MarkupColor, type Stroke } from '../../../lib/markup';
import type { PDFPageProxy } from '../../../lib/pdf/pdfjs';
import { SheetCanvas } from './SheetCanvas';
import { LiveStroke, StrokeLayer } from './StrokeLayer';
import { useSheetGestures } from './useSheetGestures';
import { clampView, fitSize, fitView, toPage, viewOn, type Pt, type Size, type View } from './viewport';

/** Where a page point (fractions) is on screen now, and how many screen pixels one page width is. */
export interface PagePlace {
  toFrame: (p: readonly [number, number]) => [number, number];
  scale: number;
  frame: Size;
}

interface SheetStageProps {
  page: PDFPageProxy;
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

export function SheetStage({ page, aspect, strokes, pen, onStroke, onError, overlay, onTap, focus, aiming = false }: SheetStageProps) {
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
  const zoomed = view.z > 1.01;

  return (
    <div className="relative min-h-0 flex-1">
      <div
        ref={frameRef}
        {...handlers}
        data-testid="sheet-frame"
        className={`absolute inset-0 touch-none select-none overflow-hidden bg-page ${pen || aiming ? 'cursor-crosshair' : 'cursor-grab'}`}
      >
        <div
          className="absolute left-0 top-0 origin-top-left bg-white shadow-card will-change-transform"
          style={{ width: fit.w, height: fit.h, transform: `translate(${String(view.x)}px, ${String(view.y)}px) scale(${String(view.z)})` }}
        >
          <SheetCanvas page={page} fit={fit} view={view} frame={frame} onError={onError} />
          <StrokeLayer strokes={strokes} aspect={aspect} />
          {live && pen ? <LiveStroke points={live} color={pen} width={HIGHLIGHT_WIDTH} aspect={aspect} /> : null}
        </div>
        {overlay && fit.w > 0 ? <div className="pointer-events-none absolute inset-0">{overlay(place)}</div> : null}
      </div>
      {zoomed ? (
        <button
          type="button"
          onClick={() => {
            setView(() => fitView(fit, frame));
          }}
          className="absolute bottom-3 right-3 h-11 rounded-full bg-card px-5 text-sm font-medium text-ink shadow-pop hover:bg-card-head focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
        >
          Fit
        </button>
      ) : null}
    </div>
  );
}
