// Opens a PDF with pdf.js (lib/pdf, its own lazy chunk) once per URL, and closes it again when the URL changes or the
// viewer goes away, so a phone holds one document at a time. `aspect` is page 1's height / width (the fit).
import { useEffect, useState } from 'react';
import { openSheet, sheetErrorMessage, type PDFDocumentProxy } from '../../lib/pdf/pdfjs';

type PdfDoc =
  | { status: 'loading' }
  | { status: 'error'; error: Error }
  | { status: 'ready'; doc: PDFDocumentProxy; aspect: number };

type Opened = { url: string } & ({ status: 'error'; error: Error } | { status: 'ready'; doc: PDFDocumentProxy; aspect: number });

export function usePdfDoc(url: string): PdfDoc {
  const [opened, setOpened] = useState<Opened | null>(null);

  useEffect(() => {
    let live = true;
    const task: { close: (() => Promise<void>) | null } = { close: null };
    const load = async () => {
      const t = await openSheet(url);
      task.close = () => t.destroy();
      // Gone before it opened: close it now; the rejected open below lands in the catch.
      if (!live) await t.destroy();
      const doc = await t.promise;
      const first = await doc.getPage(1);
      const vp = first.getViewport({ scale: 1 });
      if (live) setOpened({ url, status: 'ready', doc, aspect: vp.height / vp.width });
    };
    load().catch((e: unknown) => {
      // After the viewer moved on, closing the document rejects what was still loading: expected, nothing to show.
      if (live) setOpened({ url, status: 'error', error: new Error(sheetErrorMessage(e)) });
    });
    return () => {
      live = false;
      task.close?.().catch((e: unknown) => {
        console.warn('closing the PDF failed', e);
      });
    };
  }, [url]);

  if (opened === null || opened.url !== url) return { status: 'loading' };
  return opened.status === 'ready' ? { status: 'ready', doc: opened.doc, aspect: opened.aspect } : opened;
}
