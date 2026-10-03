// The sheet itself, drawn by pdf.js. Two canvases inside the page's layout box (they move and zoom with it):
//   - base: the whole page, sharp up to 2x, kept under BASE_PIXELS so a phone never runs out of canvas memory;
//   - detail: once the view settles past what the base shows sharply, only the part in view, at screen sharpness.
import { useEffect, useRef, useState } from 'react';
import { LoadingState } from '../../../ui/States';
import { renderRegion, type PDFPageProxy, type Region } from './pdfjs';
import { cappedDensity, visibleRegion, type Size, type View } from './viewport';

/** About 24 MB of pixels for the whole page. */
const BASE_PIXELS = 6_000_000;
/** The part in view: a phone or laptop screen at full sharpness fits. */
const DETAIL_PIXELS = 8_000_000;
const BASE_ZOOM = 2;
/** Re-render this long after the last pan or zoom. */
const SETTLE_MS = 180;

interface SheetCanvasProps {
  page: PDFPageProxy;
  /** The page's layout box at z = 1 (CSS pixels). */
  fit: Size;
  view: View;
  frame: Size;
  onError: (e: unknown) => void;
}

function pixelRatio(): number {
  return window.devicePixelRatio > 0 ? window.devicePixelRatio : 1;
}

/** Placed by hand (not by React) so the new picture and its new place land in the same frame. */
function placeDetail(canvas: HTMLCanvasElement, region: Region | null): void {
  if (region === null) {
    canvas.style.display = 'none';
    return;
  }
  Object.assign(canvas.style, {
    display: 'block', left: `${String(region.x)}px`, top: `${String(region.y)}px`, width: `${String(region.w)}px`, height: `${String(region.h)}px`,
  });
}

export function SheetCanvas({ page, fit, view, frame, onError }: SheetCanvasProps) {
  const baseRef = useRef<HTMLCanvasElement>(null);
  const detailRef = useRef<HTMLCanvasElement>(null);
  const [baseDensity, setBaseDensity] = useState(0);

  useEffect(() => {
    const canvas = baseRef.current;
    if (!canvas || fit.w <= 0) return undefined;
    const density = cappedDensity(fit.w * fit.h, pixelRatio() * BASE_ZOOM, BASE_PIXELS);
    const job = renderRegion(page, canvas, fit.w, { x: 0, y: 0, w: fit.w, h: fit.h }, density);
    job.done.then((drawn) => {
      if (drawn) setBaseDensity(density);
    }, onError);
    return job.cancel;
  }, [page, fit.w, fit.h, onError]);

  useEffect(() => {
    const canvas = detailRef.current;
    if (!canvas) return undefined;
    const region = visibleRegion({ x: view.x, y: view.y, z: view.z }, { w: fit.w, h: fit.h }, { w: frame.w, h: frame.h });
    const want = pixelRatio() * view.z;
    if (region === null || baseDensity === 0 || want <= baseDensity * 1.1) {
      placeDetail(canvas, null);
      return undefined;
    }
    const running: { cancel: (() => void) | null } = { cancel: null };
    const timer = window.setTimeout(() => {
      const density = cappedDensity(region.w * region.h, want, DETAIL_PIXELS);
      const job = renderRegion(page, canvas, fit.w, region, density, () => {
        placeDetail(canvas, region);
      });
      running.cancel = job.cancel;
      job.done.catch(onError);
    }, SETTLE_MS);
    return () => {
      window.clearTimeout(timer);
      running.cancel?.();
    };
  }, [page, fit.w, fit.h, view.x, view.y, view.z, frame.w, frame.h, baseDensity, onError]);

  return (
    <>
      <canvas ref={baseRef} aria-hidden className="absolute inset-0 h-full w-full bg-white" />
      <canvas ref={detailRef} aria-hidden className="absolute hidden" />
      {/* A big sheet can take seconds the first time (fonts, images): say so instead of showing a blank page. */}
      {baseDensity === 0 ? (
        <div className="absolute inset-0 flex items-center justify-center">
          <LoadingState label="Drawing sheet" />
        </div>
      ) : null}
    </>
  );
}
