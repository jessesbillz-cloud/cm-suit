// pdf.js, vendored in src/vendor/pdfjs (docs/decisions.md, Oct 2). Loaded only here and only by dynamic import, so it
// is its own chunk that the sheet viewer alone downloads; the worker is a separate file the bundler copies as is.
import type {
  PDFDocumentLoadingTask, PDFPageProxy, RenderTask,
} from '../../../vendor/pdfjs/pdf.min.mjs';

export type { PDFPageProxy };

const WORKER_URL = new URL('../../../vendor/pdfjs/pdf.worker.min.mjs', import.meta.url).href;

/** pdf.js fetches its image decoders from here by name, so they keep fixed names under public/. */
const WASM_URL = `${import.meta.env.BASE_URL}vendor/pdfjs-wasm/`;

/** Annotations (old markups, comments) are left off: the map PDF embeds the page content only, so both match. */
const CONTENT_ONLY = 0;

/** pdf.js logs a warning for every font it substitutes; only its errors reach the console. */
const ERRORS_ONLY = 0;

async function pdfjs() {
  const lib = await import('../../../vendor/pdfjs/pdf.min.mjs');
  lib.GlobalWorkerOptions.workerSrc = WORKER_URL;
  return lib;
}

function dataUrlBytes(url: string): Uint8Array {
  const comma = url.indexOf(',');
  if (comma < 0 || !url.slice(0, comma).endsWith(';base64')) throw new Error('The sheet is not a base64 data URL.');
  return Uint8Array.from(atob(url.slice(comma + 1)), (ch) => ch.charCodeAt(0));
}

/**
 * Opens a sheet. A signed URL is fetched once, whole (no range requests that could outlive the URL); a data: URL (the
 * e2e mock's synthetic sheet) is read in place.
 */
export async function openSheet(url: string): Promise<PDFDocumentLoadingTask> {
  const lib = await pdfjs();
  const source = url.startsWith('data:') ? { data: dataUrlBytes(url) } : { url, disableRange: true };
  // JPEG 2000 images (logos and stamps on many sheets) decode with pdf.js's OpenJPEG (public/vendor/pdfjs-wasm). The
  // CSP allows no wasm compile, so its plain-script build is what runs; eval stays off.
  return lib.getDocument({ ...source, isEvalSupported: false, wasmUrl: WASM_URL, verbosity: ERRORS_ONLY });
}

/** A short sentence for a sheet that won't open. */
export function sheetErrorMessage(e: unknown): string {
  const name = e instanceof Error ? e.name : '';
  if (name === 'PasswordException') return 'This sheet is password-protected.';
  if (name === 'InvalidPDFException') return 'This file is not a readable PDF.';
  if (name === 'ResponseException') return 'The sheet did not download.';
  return e instanceof Error && e.message !== '' ? e.message : 'The sheet did not open.';
}

/** pdf.js says a render was cancelled (a newer one replaced it): not an error. */
function isCancelled(e: unknown): boolean {
  return e instanceof Error && e.name === 'RenderingCancelledException';
}

export interface Region {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface RenderJob {
  /** True once the target holds the new picture; false when it was cancelled. */
  done: Promise<boolean>;
  cancel: () => void;
}

/**
 * Renders `region` (in fit-size pixels: the page laid out `fitWidth` wide) into `target` at `density` canvas pixels per
 * fit pixel. It draws offscreen and copies the result in one step (`onCopy` runs in that same step, e.g. to move the
 * canvas to its new region), so a re-render never flashes white.
 */
export function renderRegion(
  page: PDFPageProxy, target: HTMLCanvasElement, fitWidth: number, region: Region, density: number, onCopy?: () => void,
): RenderJob {
  const scale = (fitWidth / page.getViewport({ scale: 1 }).width) * density;
  const w = Math.max(1, Math.round(region.w * density));
  const h = Math.max(1, Math.round(region.h * density));
  const off = document.createElement('canvas');
  off.width = w;
  off.height = h;
  const ctx = off.getContext('2d', { alpha: false });
  if (!ctx) throw new Error('This browser could not draw the sheet.');
  const task: RenderTask = page.render({
    canvasContext: ctx,
    viewport: page.getViewport({ scale }),
    transform: [1, 0, 0, 1, -region.x * density, -region.y * density],
    annotationMode: CONTENT_ONLY,
    background: '#ffffff',
  });
  const release = () => {
    off.width = 0;
    off.height = 0;
  };
  const done = task.promise.then(
    () => {
      target.width = w;
      target.height = h;
      const out = target.getContext('2d');
      if (!out) throw new Error('This browser could not draw the sheet.');
      out.drawImage(off, 0, 0);
      release();
      onCopy?.();
      return true;
    },
    (e: unknown) => {
      release();
      if (isCancelled(e)) return false;
      throw e;
    },
  );
  return { done, cancel: () => { task.cancel(); } };
}
