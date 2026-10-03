// Opens page N of a sheet PDF with pdf.js. The document is closed again when the URL or the page changes or the viewer
// goes away, so a phone holds one sheet at a time.
import { useEffect, useState } from 'react';
import { openSheet, sheetErrorMessage, type PDFPageProxy } from './pdfjs';

type SheetPage =
  | { status: 'loading' }
  | { status: 'error'; error: Error }
  | { status: 'ready'; page: PDFPageProxy; /** height / width, as viewed */ aspect: number };

export function useSheetPage(url: string, pageNumber: number): { sheet: SheetPage; retry: () => void } {
  const [attempt, setAttempt] = useState(0);
  const [sheet, setSheet] = useState<SheetPage>({ status: 'loading' });

  useEffect(() => {
    let live = true;
    const opened: { close: (() => Promise<void>) | null } = { close: null };
    setSheet({ status: 'loading' });
    const load = async () => {
      const task = await openSheet(url);
      opened.close = () => task.destroy();
      // Gone before it opened: close it now; the rejected open below lands in the catch.
      if (!live) await task.destroy();
      const doc = await task.promise;
      if (pageNumber < 1 || pageNumber > doc.numPages) throw new Error(`The sheet has no page ${String(pageNumber)}.`);
      const page = await doc.getPage(pageNumber);
      const vp = page.getViewport({ scale: 1 });
      if (live) setSheet({ status: 'ready', page, aspect: vp.height / vp.width });
    };
    load().catch((e: unknown) => {
      // After the viewer moved on, closing the document rejects what was still loading: expected, nothing to show.
      if (live) setSheet({ status: 'error', error: new Error(sheetErrorMessage(e)) });
    });
    return () => {
      live = false;
      opened.close?.().catch((e: unknown) => {
        console.warn('closing the sheet failed', e);
      });
    };
  }, [url, pageNumber, attempt]);

  return {
    sheet,
    retry: () => {
      setAttempt((n) => n + 1);
    },
  };
}
