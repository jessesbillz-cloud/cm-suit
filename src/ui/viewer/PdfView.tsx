// A PDF in the viewer: every page, one under another, scrolled; + and - zoom (a trackpad's pinch too), Fit shows a
// whole page (never narrower than a readable letter page, never wider than the window), and "Page N of M" follows the
// scroll. pdf.js loads with the first PDF (lib/pdf, its own chunk). It can open at a page, and an item's own bar
// (pageBar) sits over the pages and moves through them.
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { LoaderCircle } from 'lucide-react';
import { pageText, type PDFDocumentProxy } from '../../lib/pdf/pdfjs';
import type { PageNav } from '../FileViewer';
import { Icon } from '../Icon';
import { PdfPage } from './PdfPage';
import { useBoxSize } from './useBoxSize';
import { usePdfDoc } from './usePdfDoc';
import { clampZoom } from './zoom';
import { ZoomBar } from './ZoomBar';

interface PdfViewProps {
  url: string;
  tone: 'dark' | 'light';
  startPage?: number | undefined;
  pageBar?: ((nav: PageNav) => ReactNode) | undefined;
}

const PAD = 16;
const GAP = 12;
/** A letter page at Fit is at least this wide where the window allows it, so its words can be read. */
const READABLE = 900;

/** A page's width at Fit: the whole page in the box, but at least READABLE wide, never wider than the box. */
function fitWidth(box: { w: number; h: number }, aspect: number): number {
  const across = box.w - PAD * 2;
  const whole = (box.h - PAD * 2) / aspect;
  return Math.max(1, Math.floor(Math.min(across, Math.max(READABLE, whole))));
}

interface PagesProps {
  doc: PDFDocumentProxy;
  aspect: number;
  tone: 'dark' | 'light';
  startPage?: number | undefined;
  pageBar?: ((nav: PageNav) => ReactNode) | undefined;
}

function Pages({ doc, aspect, tone, startPage, pageBar }: PagesProps) {
  const scroller = useRef<HTMLDivElement>(null);
  const size = useBoxSize(scroller);
  const [zoom, setZoom] = useState(1);
  const [current, setCurrent] = useState(1);
  const width = size.w > 0 ? Math.round(fitWidth(size, aspect) * zoom) : 0;
  const lastWidth = useRef(width);

  // Zooming keeps the same place in the document in view.
  useLayoutEffect(() => {
    const el = scroller.current;
    const before = lastWidth.current;
    lastWidth.current = width;
    if (!el || before <= 0 || width <= 0 || before === width) return;
    const ratio = width / before;
    el.scrollTop = el.scrollTop * ratio;
    el.scrollLeft = (el.scrollLeft + el.clientWidth / 2) * ratio - el.clientWidth / 2;
  }, [width]);

  // A trackpad's pinch (the wheel with Ctrl) zooms; the plain wheel scrolls the pages.
  useEffect(() => {
    const el = scroller.current;
    if (!el) return undefined;
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey) return;
      e.preventDefault();
      setZoom((z) => clampZoom(z * Math.exp(-e.deltaY * 0.01)));
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => {
      el.removeEventListener('wheel', onWheel);
    };
  }, []);

  // After a jump the page asked for stays the page shown, even where the end of the document stops it short of the
  // top, until the reader scrolls on.
  const jumped = useRef<{ page: number; top: number } | null>(null);

  const onScroll = () => {
    const el = scroller.current;
    if (!el) return;
    const pin = jumped.current;
    if (pin && Math.abs(el.scrollTop - pin.top) < 2) return;
    jumped.current = null;
    const line = el.scrollTop + el.clientHeight / 3;
    let n = 1;
    for (const p of el.querySelectorAll<HTMLElement>('[data-page]')) {
      if (p.offsetTop <= line) n = Number(p.dataset['page']);
      else break;
    }
    setCurrent((c) => (c === n ? c : n));
  };

  // A page's top at the top of the view (the pages above it keep their laid-out height, so it lands right away).
  const goTo = (n: number) => {
    const el = scroller.current;
    const to = Math.min(Math.max(1, Math.round(n)), doc.numPages);
    const p = el?.querySelector<HTMLElement>(`[data-page="${String(to)}"]`);
    if (!el || !p) return;
    el.scrollTop = Math.max(0, p.offsetTop - GAP);
    jumped.current = { page: to, top: el.scrollTop };
    setCurrent(to);
  };
  const goToRef = useRef(goTo);
  useLayoutEffect(() => {
    goToRef.current = goTo;
  });

  // Opening at a page: once, when the pages first have their size.
  const opened = useRef(false);
  useLayoutEffect(() => {
    if (opened.current || width <= 0) return;
    opened.current = true;
    if (startPage !== undefined && startPage > 1) goToRef.current(startPage);
  }, [width, startPage]);

  const pages = Array.from({ length: doc.numPages }, (_, i) => i + 1);
  const bar = pageBar?.({ page: current, pages: doc.numPages, goTo, text: (n) => pageText(doc, n) });
  return (
    <div className="flex h-full w-full flex-col">
      {bar}
      <div className="relative min-h-0 w-full flex-1">
        <div
          ref={scroller}
          data-testid="viewer-pdf"
          className={`h-full w-full overflow-auto ${tone === 'dark' ? '' : 'bg-page'}`}
          onScroll={onScroll}
        >
          <div
            className="relative mx-auto flex flex-col items-center"
            style={{ width: `${String(width + PAD * 2)}px`, gap: `${String(GAP)}px`, padding: `${String(PAD)}px ${String(PAD)}px 72px` }}
          >
            {width > 0 ? pages.map((n) => <PdfPage key={n} doc={doc} number={n} width={width} aspect={aspect} root={scroller} />) : null}
          </div>
        </div>
        <ZoomBar zoom={zoom} onZoom={setZoom} tone={tone} pageLabel={`Page ${String(current)} of ${String(doc.numPages)}`} />
      </div>
    </div>
  );
}

export function PdfView({ url, tone, startPage, pageBar }: PdfViewProps) {
  const pdf = usePdfDoc(url);
  if (pdf.status === 'loading') {
    return (
      <div role="status" className={`flex h-full items-center justify-center gap-2 text-sm ${tone === 'dark' ? 'text-white/80' : 'text-ink-2'}`}>
        <Icon icon={LoaderCircle} size={18} className="animate-spin" />
        Opening the PDF...
      </div>
    );
  }
  if (pdf.status === 'error') {
    return (
      <p role="alert" className={`flex h-full items-center justify-center px-6 text-center text-sm ${tone === 'dark' ? 'text-white' : 'text-danger'}`}>
        {pdf.error.message}
      </p>
    );
  }
  return <Pages doc={pdf.doc} aspect={pdf.aspect} tone={tone} startPage={startPage} pageBar={pageBar} />;
}
