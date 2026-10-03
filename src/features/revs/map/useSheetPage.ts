// Opens a sheet PDF with pdf.js and page N of it. The document is opened once per URL (a plan set kept as one PDF is
// read once, whatever page is picked) and closed again when the URL changes or the viewer goes away, so a phone holds
// one sheet at a time. `pages` is the document's page count once it is open (the map's page picker).
import { useEffect, useState } from 'react';
import { openSheet, sheetErrorMessage, type PDFDocumentProxy, type PDFPageProxy } from './pdfjs';

type SheetPage =
  | { status: 'loading' }
  | { status: 'error'; error: Error }
  | { status: 'ready'; page: PDFPageProxy; /** height / width, as viewed */ aspect: number };

type SheetDoc = { status: 'loading' } | { status: 'error'; error: Error } | { status: 'ready'; doc: PDFDocumentProxy };

/** A page as loaded, with the document and number it is for (a newer pick or document makes it stale). */
type LoadedPage = { doc: PDFDocumentProxy; number: number } & ({ status: 'error'; error: Error } | { status: 'ready'; page: PDFPageProxy; aspect: number });

export function useSheetPage(url: string, pageNumber: number): { sheet: SheetPage; pages: number | null; retry: () => void } {
  const [attempt, setAttempt] = useState(0);
  const [doc, setDoc] = useState<SheetDoc>({ status: 'loading' });
  const [loaded, setLoaded] = useState<LoadedPage | null>(null);

  useEffect(() => {
    let live = true;
    const opened: { close: (() => Promise<void>) | null } = { close: null };
    setDoc({ status: 'loading' });
    const load = async () => {
      const task = await openSheet(url);
      opened.close = () => task.destroy();
      // Gone before it opened: close it now; the rejected open below lands in the catch.
      if (!live) await task.destroy();
      const d = await task.promise;
      if (live) setDoc({ status: 'ready', doc: d });
    };
    load().catch((e: unknown) => {
      // After the viewer moved on, closing the document rejects what was still loading: expected, nothing to show.
      if (live) setDoc({ status: 'error', error: new Error(sheetErrorMessage(e)) });
    });
    return () => {
      live = false;
      opened.close?.().catch((e: unknown) => {
        console.warn('closing the sheet failed', e);
      });
    };
  }, [url, attempt]);

  useEffect(() => {
    if (doc.status !== 'ready') return undefined;
    let live = true;
    const d = doc.doc;
    const load = async (): Promise<LoadedPage> => {
      if (pageNumber < 1 || pageNumber > d.numPages) throw new Error(`The sheet has no page ${String(pageNumber)}.`);
      const page = await d.getPage(pageNumber);
      const vp = page.getViewport({ scale: 1 });
      return { doc: d, number: pageNumber, status: 'ready', page, aspect: vp.height / vp.width };
    };
    load().then(
      (p) => {
        if (live) setLoaded(p);
      },
      (e: unknown) => {
        if (live) setLoaded({ doc: d, number: pageNumber, status: 'error', error: new Error(sheetErrorMessage(e)) });
      },
    );
    return () => {
      live = false;
    };
  }, [doc, pageNumber]);

  const current = doc.status === 'ready' && loaded !== null && loaded.doc === doc.doc && loaded.number === pageNumber ? loaded : null;
  const sheet: SheetPage =
    doc.status !== 'ready'
      ? doc
      : current === null
        ? { status: 'loading' }
        : current.status === 'ready'
          ? { status: 'ready', page: current.page, aspect: current.aspect }
          : { status: 'error', error: current.error };

  return {
    sheet,
    pages: doc.status === 'ready' ? doc.doc.numPages : null,
    retry: () => {
      setAttempt((n) => n + 1);
    },
  };
}
