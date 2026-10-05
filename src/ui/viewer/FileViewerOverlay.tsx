// The full-screen viewer: fixed over the whole window on a dark backdrop. A top bar with the file's name (and "2 of 5"
// in a list), Download, Delete (when the item allows it) and Close; Prev / Next at the sides of a list. Escape closes it,
// left / right move through the list, Tab stays inside, and focus goes back where it was when it closes.
import { useEffect, useRef, type KeyboardEvent } from 'react';
import { createPortal } from 'react-dom';
import { ChevronLeft, ChevronRight, Download, Trash2, X } from 'lucide-react';
import { Icon } from '../Icon';
import type { ViewerItem } from '../FileViewer';
import { useViewerDownload } from './useViewerDownload';
import { ViewerBody } from './ViewerBody';

interface FileViewerOverlayProps {
  items: readonly ViewerItem[];
  index: number;
  onIndex: (index: number) => void;
  /** The item at this index was deleted: drop it from the list (the provider closes the viewer when none are left). */
  onRemoved: (index: number) => void;
  onClose: () => void;
}

const BAR_BTN =
  'inline-flex h-10 items-center justify-center gap-1.5 rounded-lg px-3 text-sm font-medium text-white/90 hover:bg-white/15 focus-visible:outline focus-visible:outline-2 focus-visible:outline-white disabled:opacity-50';
const SIDE_BTN =
  'absolute top-1/2 z-10 flex h-12 w-12 -translate-y-1/2 items-center justify-center rounded-full bg-black/55 text-white hover:bg-black/75 focus-visible:outline focus-visible:outline-2 focus-visible:outline-white';

function focusables(root: HTMLElement): HTMLElement[] {
  return [...root.querySelectorAll<HTMLElement>('button:not([disabled]), [href], [tabindex]:not([tabindex="-1"])')];
}

export function FileViewerOverlay({ items, index, onIndex, onRemoved, onClose }: FileViewerOverlayProps) {
  const root = useRef<HTMLDivElement>(null);
  const closeBtn = useRef<HTMLButtonElement>(null);
  const download = useViewerDownload();
  const item = items[index];
  const many = items.length > 1;
  // At either end its arrow hides, and would take the focus with it: the viewer keeps it, so the keys still work.
  const go = (to: number) => {
    if (to === 0 || to === items.length - 1) root.current?.focus({ preventScroll: true });
    onIndex(to);
  };
  const prev =
    index > 0
      ? () => {
          go(index - 1);
        }
      : undefined;
  const next =
    index < items.length - 1
      ? () => {
          go(index + 1);
        }
      : undefined;

  // Focus moves in on open and back to where it was on close; the page under it does not scroll.
  useEffect(() => {
    const before = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    closeBtn.current?.focus({ preventScroll: true });
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = overflow;
      before?.focus({ preventScroll: true });
    };
  }, []);

  if (!item) return null;

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
    } else if (e.key === 'ArrowLeft' && prev) {
      e.preventDefault();
      prev();
    } else if (e.key === 'ArrowRight' && next) {
      e.preventDefault();
      next();
    } else if (e.key === 'Tab' && root.current) {
      const list = focusables(root.current);
      const first = list[0];
      const last = list[list.length - 1];
      if (!first || !last) return;
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
  };

  const remove = item.remove;
  return createPortal(
    <div
      ref={root}
      role="dialog"
      aria-modal="true"
      aria-label={item.name}
      data-testid="file-viewer"
      tabIndex={-1}
      // Over everything but the toast (z-50), so a Delete's Undo shows on top of it.
      className="fixed inset-0 z-[45] flex flex-col bg-[#0b0f17]/95 text-white outline-none"
      onKeyDown={onKeyDown}
    >
      <div className="flex min-h-14 shrink-0 items-center gap-1 border-b border-white/10 px-2 pt-[env(safe-area-inset-top)] sm:gap-2 sm:px-4">
        <div className="min-w-0 flex-1 px-1">
          <p data-testid="viewer-name" className="break-words text-sm font-medium leading-5 sm:text-[15px]">
            {item.name}
          </p>
          {many ? (
            <p data-testid="viewer-count" className="text-xs tabular-nums text-white/60">
              {index + 1} of {items.length}
            </p>
          ) : null}
        </div>
        <button
          type="button"
          className={BAR_BTN}
          data-testid="viewer-download"
          aria-label={`Download ${item.name}`}
          disabled={download.pendingId === item.id}
          onClick={() => {
            download.start(item);
          }}
        >
          <Icon icon={Download} size={18} />
          <span className="hidden sm:inline">Download</span>
        </button>
        {remove ? (
          <button
            type="button"
            className={BAR_BTN}
            data-testid="viewer-delete"
            aria-label={`Delete ${item.name}`}
            onClick={() => {
              onRemoved(index);
              remove();
            }}
          >
            <Icon icon={Trash2} size={18} />
            <span className="hidden sm:inline">Delete</span>
          </button>
        ) : null}
        <button ref={closeBtn} type="button" className={BAR_BTN} data-testid="viewer-close" aria-label="Close" onClick={onClose}>
          <Icon icon={X} size={20} />
          <span className="hidden sm:inline">Close</span>
        </button>
      </div>
      <div className="relative min-h-0 flex-1">
        <ViewerBody
          key={item.id}
          item={item}
          tone="dark"
          onDownload={() => {
            download.start(item);
          }}
          downloading={download.pendingId === item.id}
        />
        {many ? (
          <>
            <button type="button" className={`${SIDE_BTN} left-2 disabled:hidden sm:left-4`} aria-label="Previous file" data-testid="viewer-prev" disabled={!prev} onClick={prev}>
              <Icon icon={ChevronLeft} size={24} />
            </button>
            <button type="button" className={`${SIDE_BTN} right-2 disabled:hidden sm:right-4`} aria-label="Next file" data-testid="viewer-next" disabled={!next} onClick={next}>
              <Icon icon={ChevronRight} size={24} />
            </button>
          </>
        ) : null}
      </div>
    </div>,
    document.body,
  );
}
