// The sheet viewer's frame (map/SheetStage inside): in its place on the page, or over the whole window (Full screen)
// with the sheet's name, its actions (Download) and Exit; Escape exits too. The sheet stays mounted either way, so its
// pan and zoom carry over. Used by the Revs plan and a request's map. Documents have their own viewer (ui/FileViewer).
import { useEffect, type ReactNode } from 'react';
import { Maximize2, Minimize2 } from 'lucide-react';
import { Button } from '../../../ui/Button';

interface SheetFrameProps {
  full: boolean;
  onFull: (full: boolean) => void;
  /** The sheet's name, at the top in full screen. */
  title: string;
  /** Beside Full screen on the sheet, and at the top in full screen. */
  actions?: ReactNode;
  /** Under the top bar in full screen (the plan's drawing bar). */
  bar?: ReactNode;
  /** The frame in its place on the page. */
  className: string;
  testId?: string | undefined;
  page?: number | undefined;
  children: ReactNode;
}

const FULL = 'fixed inset-0 z-40 flex flex-col bg-page';

export function SheetFrame({ full, onFull, title, actions, bar, className, testId, page, children }: SheetFrameProps) {
  useEffect(() => {
    if (!full) return undefined;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onFull(false);
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
    };
  }, [full, onFull]);

  // One shape in both modes (the top bar null in place): the sheet below is never remounted.
  return (
    <div
      className={full ? FULL : className}
      data-testid={testId}
      data-page={page}
      data-full={full ? 'true' : undefined}
      role={full ? 'dialog' : undefined}
      aria-modal={full ? true : undefined}
      aria-label={full ? title : undefined}
    >
      {full ? (
        <div className="flex shrink-0 flex-col gap-2 border-b border-line bg-card px-3 py-2 pt-[max(0.5rem,env(safe-area-inset-top))]">
          <div className="flex items-center gap-2">
            <h2 className="min-w-0 flex-1 break-words text-[15px] font-semibold leading-6 text-ink">{title}</h2>
            {actions}
            <Button icon={Minimize2} autoFocus data-testid="sheet-exit" onClick={() => { onFull(false); }}>
              Exit
            </Button>
          </div>
          {bar}
        </div>
      ) : null}
      <div className="relative flex min-h-0 flex-1 flex-col">
        {children}
        {full ? null : (
          <div className="absolute right-2 top-2 flex items-center gap-1 rounded-full bg-card p-1 shadow-pop">
            {actions}
            <Button
              size="sm"
              variant="quiet"
              icon={Maximize2}
              aria-label="Full screen"
              title="Full screen"
              className="!rounded-full"
              data-testid="sheet-full"
              onClick={() => { onFull(true); }}
            />
          </div>
        )}
      </div>
    </div>
  );
}
