// One page of a PDF in the viewer: a box of the page's size that draws itself with pdf.js while it is on screen or
// close to it, and lets its pixels go again when it scrolls far away (a long set never fills a phone's memory).
import { useEffect, useRef, useState, type RefObject } from 'react';
import { renderRegion, sheetErrorMessage, type PDFDocumentProxy, type PDFPageProxy } from '../../lib/pdf/pdfjs';

interface PdfPageProps {
  doc: PDFDocumentProxy;
  number: number;
  /** The page's width on screen (CSS pixels). */
  width: number;
  /** height / width until the page itself is read (page 1's). */
  aspect: number;
  /** The scrolling box the page sits in. */
  root: RefObject<HTMLDivElement | null>;
}

/** About 32 MB of pixels per page at most. */
const MAX_PIXELS = 8_000_000;

function pixelRatio(): number {
  return window.devicePixelRatio > 0 ? window.devicePixelRatio : 1;
}

export function PdfPage({ doc, number, width, aspect, root }: PdfPageProps) {
  const holder = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [near, setNear] = useState(number === 1);
  const [page, setPage] = useState<PDFPageProxy | null>(null);
  const [drawn, setDrawn] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);
  const own = page ? page.getViewport({ scale: 1 }) : null;
  const pageAspect = own ? own.height / own.width : aspect;
  const height = Math.round(width * pageAspect);

  useEffect(() => {
    const el = holder.current;
    if (!el) return undefined;
    const io = new IntersectionObserver(
      (entries) => {
        const e = entries[0];
        if (e) setNear(e.isIntersecting);
      },
      { root: root.current, rootMargin: '1200px 0px' },
    );
    io.observe(el);
    return () => {
      io.disconnect();
    };
  }, [root]);

  useEffect(() => {
    if (!near || page !== null) return undefined;
    let live = true;
    doc.getPage(number).then(
      (p) => {
        if (live) setPage(p);
      },
      (e: unknown) => {
        if (live) setFailed(sheetErrorMessage(e));
      },
    );
    return () => {
      live = false;
    };
  }, [near, page, doc, number]);

  useEffect(() => {
    const c = canvas.current;
    if (!c) return undefined;
    if (!near || page === null || width <= 0) {
      // Far away: give the pixels back.
      c.width = 0;
      c.height = 0;
      setDrawn(false);
      return undefined;
    }
    const h = width * pageAspect;
    const density = Math.min(pixelRatio(), Math.sqrt(MAX_PIXELS / Math.max(1, width * h)));
    const job = renderRegion(page, c, width, { x: 0, y: 0, w: width, h }, density);
    job.done.then(
      (done) => {
        if (done) setDrawn(true);
      },
      (e: unknown) => {
        setFailed(sheetErrorMessage(e));
      },
    );
    return job.cancel;
  }, [near, page, width, pageAspect]);

  return (
    <div
      ref={holder}
      data-page={number}
      data-testid="viewer-pdf-page"
      className="relative shrink-0 bg-white shadow-card"
      style={{ width: `${String(width)}px`, height: `${String(height)}px` }}
    >
      {!drawn && failed === null ? <span aria-hidden className="absolute inset-0 animate-pulse bg-line/50" /> : null}
      {failed !== null ? (
        <p role="alert" className="absolute inset-0 flex items-center justify-center px-4 text-center text-sm text-danger">
          {failed}
        </p>
      ) : null}
      <canvas ref={canvas} aria-label={`Page ${String(number)}`} className="block h-full w-full" />
    </div>
  );
}
