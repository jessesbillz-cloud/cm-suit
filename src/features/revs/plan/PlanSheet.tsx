// A level's plan sheet in the one sheet viewer (map/SheetStage: pinch, wheel or + / - to zoom, drag to pan, Fit), its
// walls drawn over it (PlanWalls). The sheet comes through Revs' own gate (data/sheetUrl usePlanSheetUrl); a plan set
// kept as one PDF shows the page its walls are on. Full screen puts the same viewer over the window (map/SheetFrame);
// Download saves the sheet on screen, one tap, through the same gate (PlanDownload).
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { usePlanSheetUrl } from '../../../data/sheetUrl';
import type { Stroke } from '../../../lib/markup';
import { ErrorState, LoadingState } from '../../../ui/States';
import { SheetFrame } from '../map/SheetFrame';
import { SheetStage, type PagePlace } from '../map/SheetStage';
import { useSheetPage } from '../map/useSheetPage';
import { PlanDownload } from './PlanDownload';
import type { Box, PlanTarget, Pt } from './planGeom';

interface PlanSheetProps {
  projectId: string;
  target: PlanTarget;
  /** What sits over the sheet, given where page points are on screen and the page's height / width. */
  overlay: (place: PagePlace, aspect: number) => ReactNode;
  onTap: (page: Pt, at: Pt, place: PagePlace, aspect: number) => void;
  focus: Box | null;
  aiming: boolean;
  /** A bar sits above it: a little shorter. */
  drawing: boolean;
  /** The PDF's page count, once open. */
  onPages: (pages: number) => void;
  /** Over the whole window, and what sits under its top bar there (drawing). */
  full: boolean;
  onFull: (full: boolean) => void;
  bar?: ReactNode;
}

/** The plan has no marks of its own: its walls are the overlay. */
const NO_STROKES: readonly Stroke[] = [];

/** The sheet's frame: most of a phone's screen; on a desktop, the window less the header and the bars above it. */
const FRAME = 'relative flex min-h-[340px] flex-col overflow-hidden rounded-lg border border-line bg-page sm:min-h-[360px]';
const FRAME_LOOK = `${FRAME} h-[62dvh] sm:h-[calc(100dvh-280px)]`;
const FRAME_DRAW = `${FRAME} h-[58dvh] sm:h-[calc(100dvh-350px)]`;

type PageProps = Pick<PlanSheetProps, 'target' | 'overlay' | 'onTap' | 'focus' | 'aiming' | 'onPages'> & { url: string };

function PlanPage({ url, target, overlay, onTap, focus, aiming, onPages }: PageProps) {
  const { sheet, pages, retry } = useSheetPage(url, target.page);
  const [renderError, setRenderError] = useState<Error | null>(null);
  useEffect(() => {
    if (pages !== null) onPages(pages);
  }, [pages, onPages]);
  const onError = useCallback((e: unknown) => {
    setRenderError(e instanceof Error ? e : new Error('The sheet did not draw.'));
  }, []);
  const error = sheet.status === 'error' ? sheet.error : renderError;
  if (error) {
    return (
      <ErrorState
        error={error}
        title="The plan did not open."
        onRetry={() => {
          setRenderError(null);
          retry();
        }}
      />
    );
  }
  if (sheet.status !== 'ready') return <LoadingState label="Opening the plan" />;
  const { aspect } = sheet;
  return (
    <SheetStage
      // Another page opens on the whole page again.
      key={target.page}
      page={sheet.page}
      aspect={aspect}
      strokes={NO_STROKES}
      pen={null}
      onStroke={() => undefined}
      onError={onError}
      overlay={(place) => overlay(place, aspect)}
      onTap={(p, at, place) => {
        onTap(p, [at.x, at.y], place, aspect);
      }}
      focus={focus}
      aiming={aiming}
    />
  );
}

export function PlanSheet({ projectId, target, drawing, full, onFull, bar, ...rest }: PlanSheetProps) {
  const url = usePlanSheetUrl(projectId, target.fileId);
  const name = (url.data?.name ?? 'Plan').replace(/\.pdf$/i, '');
  return (
    <SheetFrame
      full={full}
      onFull={onFull}
      title={target.page > 1 ? `${name} · p. ${String(target.page)}` : name}
      bar={bar}
      actions={<PlanDownload projectId={projectId} fileId={target.fileId} name={url.data?.name ?? null} testId="plan-download" />}
      className={drawing ? FRAME_DRAW : FRAME_LOOK}
      testId="plan-sheet"
      page={target.page}
    >
      {url.isError ? (
        <ErrorState error={url.error} title="The plan did not open." onRetry={() => void url.refetch()} />
      ) : url.isPending ? (
        <LoadingState label="Opening the plan" />
      ) : (
        <PlanPage url={url.data.url} target={target} {...rest} />
      )}
    </SheetFrame>
  );
}
