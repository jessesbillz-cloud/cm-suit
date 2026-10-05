// A PDF in the viewer: every page, one under another, scrolled; + and - zoom, Fit shows a whole page (never narrower
// than a readable letter page, never wider than the window), and "Page N of M" follows the scroll. pdf.js loads with
// the first PDF (lib/pdf, its own chunk).
import { useLayoutEffect, useRef, useState } from 'react';
import { LoaderCircle } from 'lucide-react';
import type { PDFDocumentProxy } from '../../lib/pdf/pdfjs';
import { Icon } from '../Icon';
import { PdfPage } from './PdfPage';
import { useBoxSize } from './useBoxSize';
import { usePdfDoc } from './usePdfDoc';
import { ZoomBar } from './ZoomBar';

interface PdfViewProps {
  url: string;
  tone: 'dark' | 'light';
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
}

function Pages({ doc, aspect, tone }: PagesProps) {
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

  const onScroll = () => {
    const el = scroller.current;
    if (!el) return;
    const line = el.scrollTop + el.clientHeight / 3;
    let n = 1;
    for (const p of el.querySelectorAll<HTMLElement>('[data-page]')) {
      if (p.offsetTop <= line) n = Number(p.dataset['page']);
      else break;
    }
    setCurrent((c) => (c === n ? c : n));
  };

  const pages = Array.from({ length: doc.numPages }, (_, i) => i + 1);
  return (
    <div className="relative h-full w-full">
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
  );
}

export function PdfView({ url, tone }: PdfViewProps) {
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
  return <Pages doc={pdf.doc} aspect={pdf.aspect} tone={tone} />;
}
