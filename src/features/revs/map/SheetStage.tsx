// The sheet in its frame: pdf.js underneath, the marks on top, both moved by one pan/zoom transform. Starts with the
// whole page in view; "Fit" comes back to it.
import { useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import { HIGHLIGHT_WIDTH, type MarkupColor, type Stroke } from '../../../lib/markup';
import type { PDFPageProxy } from './pdfjs';
import { SheetCanvas } from './SheetCanvas';
import { LiveStroke, StrokeLayer } from './StrokeLayer';
import { useSheetGestures } from './useSheetGestures';
import { clampView, fitSize, fitView, type Size, type View } from './viewport';

interface SheetStageProps {
  page: PDFPageProxy;
  /** Page height / width, as viewed. */
  aspect: number;
  strokes: readonly Stroke[];
  /** The color one finger draws with; null: one finger pans. */
  pen: MarkupColor | null;
  onStroke: (points: [number, number][]) => void;
  onError: (e: unknown) => void;
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

export function SheetStage({ page, aspect, strokes, pen, onStroke, onError }: SheetStageProps) {
  const frameRef = useRef<HTMLDivElement>(null);
  const frame = useElementSize(frameRef);
  const fit = useMemo(() => fitSize(aspect, frame), [aspect, frame]);
  const [view, setView] = useState<View>({ x: 0, y: 0, z: 1 });

  // A new frame size (a turned phone, a resized window): the whole page while at 1x, else the same view kept inside.
  useEffect(() => {
    setView((v) => (v.z === 1 ? fitView(fit, frame) : clampView(v, fit, frame)));
  }, [fit, frame]);

  const { live, handlers } = useSheetGestures({ frameRef, fit, frame, view, setView, drawing: pen !== null, onStroke });
  const zoomed = view.z > 1.01;

  return (
    <div className="relative min-h-0 flex-1">
      <div
        ref={frameRef}
        {...handlers}
        data-testid="sheet-frame"
        className={`absolute inset-0 touch-none select-none overflow-hidden bg-page ${pen ? 'cursor-crosshair' : 'cursor-grab'}`}
      >
        <div
          className="absolute left-0 top-0 origin-top-left bg-white shadow-card will-change-transform"
          style={{ width: fit.w, height: fit.h, transform: `translate(${String(view.x)}px, ${String(view.y)}px) scale(${String(view.z)})` }}
        >
          <SheetCanvas page={page} fit={fit} view={view} frame={frame} onError={onError} />
          <StrokeLayer strokes={strokes} aspect={aspect} />
          {live && pen ? <LiveStroke points={live} color={pen} width={HIGHLIGHT_WIDTH} aspect={aspect} /> : null}
        </div>
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
