// An OSFM inspection map: a plan sheet with the inspected walls highlighted, one color per item (three at most, the
// legend is `items`). Phone first: two fingers pan and zoom; one finger draws with the picked color, or pans with Move
// on. Undo, and Clear (which Undo brings back). Read-only shows the sheet, the marks and the legend.
//
// No data fetching here: the caller passes a fresh signed URL of the sheet (src/data/sheetUrl.ts useSheetUrl) and saves
// what onChange hands back (the whole list of strokes after every change). `onPages` hears the PDF's page count once it
// is open (a plan set kept as one PDF: the caller's page picker); another page starts a new Undo history. `onAspect`
// hears the shown page's height / width once it is open (the request's walls drawn on the map from the plan).
import { useCallback, useEffect, useState, type KeyboardEvent } from 'react';
import { ErrorState, LoadingState } from '../../../ui/States';
import { useToast } from '../../../ui/Toast';
import {
  HIGHLIGHT_WIDTH, STROKE_LIMITS, finishStroke, rememberBefore, undoStep, type MarkupColor, type Stroke,
} from '../../../lib/markup';
import { MarkupBar, MarkupLegend, type MarkupItem } from './MarkupBar';
import { SheetStage } from './SheetStage';
import { useSheetPage } from './useSheetPage';

interface SheetMarkupProps {
  /** A fresh signed URL of the sheet PDF. */
  sheetUrl: string;
  /** 1-based page of the PDF. */
  page: number;
  strokes: Stroke[];
  /** The request's items in order: color 1, 2, 3 and the name each one stands for. */
  items: MarkupItem[];
  readOnly: boolean;
  onChange: (strokes: Stroke[]) => void;
  onPages?: ((pages: number) => void) | undefined;
  onAspect?: ((aspect: number) => void) | undefined;
}

export function SheetMarkup({ sheetUrl, page, strokes, items, readOnly, onChange, onPages, onAspect }: SheetMarkupProps) {
  const { sheet, pages, retry } = useSheetPage(sheetUrl, page);
  const toast = useToast();
  const [picked, setPicked] = useState<MarkupColor | null>(items[0]?.color ?? null);
  const [moving, setMoving] = useState(false);
  const [past, setPast] = useState<Stroke[][]>([]);
  const [pastOf, setPastOf] = useState(`${sheetUrl}#${String(page)}`);
  const [renderError, setRenderError] = useState<Error | null>(null);

  // Undo steps back through the marks of this page only.
  const shown = `${sheetUrl}#${String(page)}`;
  if (pastOf !== shown) {
    setPastOf(shown);
    setPast([]);
  }

  useEffect(() => {
    if (pages !== null) onPages?.(pages);
  }, [pages, onPages]);

  const pen = readOnly || moving || !items.some((it) => it.color === picked) ? null : picked;
  const aspect = sheet.status === 'ready' ? sheet.aspect : 1;
  const ready = sheet.status === 'ready';

  useEffect(() => {
    if (ready) onAspect?.(aspect);
  }, [ready, aspect, onAspect]);

  const onStroke = (points: [number, number][]) => {
    if (pen === null) return;
    if (strokes.length >= STROKE_LIMITS.maxStrokes) {
      toast.show({ message: `${String(STROKE_LIMITS.maxStrokes)} marks at most. Undo or Clear.`, tone: 'error' });
      return;
    }
    const s = finishStroke(points, pen, HIGHLIGHT_WIDTH, aspect);
    if (s === null) return;
    setPast((p) => rememberBefore(p, strokes));
    onChange([...strokes, s]);
  };

  const undo = () => {
    const step = undoStep(past);
    if (step === null) return;
    setPast(step.past);
    onChange(step.strokes);
  };

  const clear = () => {
    if (strokes.length === 0) return;
    setPast((p) => rememberBefore(p, strokes));
    onChange([]);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (!readOnly && (e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') {
      e.preventDefault();
      undo();
    }
  };

  const onRenderError = useCallback((e: unknown) => {
    setRenderError(e instanceof Error ? e : new Error('The sheet did not draw.'));
  }, []);

  const error = sheet.status === 'error' ? sheet.error : renderError;

  return (
    <div className="flex h-full min-h-0 flex-col bg-page" onKeyDown={onKeyDown} data-testid="sheet-markup">
      <div className="order-last sm:order-first">
        {readOnly ? (
          <MarkupLegend items={items} />
        ) : (
          <MarkupBar
            items={items}
            pen={pen}
            moving={moving}
            canUndo={past.length > 0}
            canClear={strokes.length > 0}
            onPick={(c) => {
              setPicked(c);
              setMoving(false);
            }}
            onMove={() => {
              setMoving((m) => !m);
            }}
            onUndo={undo}
            onClear={clear}
          />
        )}
      </div>
      {error ? (
        <ErrorState
          error={error}
          title="The sheet did not open."
          onRetry={() => {
            setRenderError(null);
            retry();
          }}
        />
      ) : sheet.status === 'loading' ? (
        <LoadingState label="Opening sheet" />
      ) : sheet.status === 'ready' ? (
        <SheetStage page={sheet.page} aspect={sheet.aspect} strokes={strokes} pen={pen} onStroke={onStroke} onError={onRenderError} />
      ) : null}
    </div>
  );
}
