// THE file viewer (Jesse, Oct 4: "an upload and a delete and a full screen ... across the whole app"). One full-screen
// overlay for photos, PDFs and every other file, mounted once at the root (FileViewerProvider in app/main.tsx); any
// screen opens it. FilePreview is the same rendering in a box, for a pane; its button opens the file in its own window
// (Jesse, Oct 12: one Full screen, the column's, and one New window).
//
// HOW TO USE
//   import { useFileViewer, FilePreview, type ViewerItem } from '../../ui/FileViewer';
//   import { usePreviewFetch } from '../../data/preview';
//
//   const viewer = useFileViewer();
//   const preview = usePreviewFetch();
//   const items: ViewerItem[] = photos.map((f) => ({
//     id: f.id,
//     name: f.original_name,
//     kind: fileKind(f.original_name, f.mime),          // lib/fileKind: 'image' | 'pdf' | 'other'
//     url: () => preview(f.id, { rfiId }),               // a URL to show; `via` as the place's own gate needs
//     download: () => downloadFile(f.id, f.size),        // the place's own download (one click, original name)
//     remove: canRemove ? () => removeWithUndo(f) : undefined,  // optional; the caller shows its Undo toast
//   }));
//   <button onClick={() => { viewer.open(items, index); }}>...</button>     // a photo strip: arrows walk the list
//   <Button onClick={() => { viewer.open([item]); }}>Full screen</Button>   // one PDF
//   <FilePreview item={item} onOpenWindow={openWindow} />  // inline, filling a pane: New window
//   A PDF may open at a page (`startPage`) and carry its own bar over the pages (`pageBar`) and panel beside them
//   (`pageSide`: the spec book's sections), which get where the reader is (PageNav) and move them.
//
// The overlay: file name, Download, Delete (only when the item has `remove`), Close; Escape and Close close it; focus
// stays inside; left / right (and the arrows) move through the list. Photos: fitted, tap or +/- to zoom, drag to pan.
// PDFs (pdf.js, its own lazy chunk): pages one under another, +/- and Fit, "Page N of M".
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { ExternalLink } from 'lucide-react';
import { Button } from './Button';
import { FileViewerOverlay } from './viewer/FileViewerOverlay';
import { ViewerBody } from './viewer/ViewerBody';
import { useViewerDownload } from './viewer/useViewerDownload';

export interface ViewerItem {
  /** Stable per file (a list's key; the URL is asked again when it changes). */
  id: string;
  /** The file's name as people know it (shown, and the alt text of a photo). */
  name: string;
  /** What to draw: a photo, a PDF's pages, or an icon with Download. lib/fileKind decides it from name and type. */
  kind: 'image' | 'pdf' | 'other';
  /** A URL the browser may show (photos) or pdf.js may read (PDFs): data/preview usePreviewFetch for stored files. */
  url: () => Promise<string>;
  /** The place's own one-click download (original filename). The viewer shows its spinner and any error. */
  download: () => Promise<void>;
  /** Delete, when this person may. The viewer closes the item (or the viewer) first; the caller's toast offers Undo. */
  remove?: (() => void) | undefined;
  /** A PDF: the page it opens at (1, the first, when left out). */
  startPage?: number | undefined;
  /** A PDF: a bar over its pages, drawn from where the reader is (the spec book's section picker). */
  pageBar?: ((nav: PageNav) => ReactNode) | undefined;
  /** A PDF: a panel left of its pages (the spec book's sections, on a desktop). */
  pageSide?: ((nav: PageNav) => ReactNode) | undefined;
}

/** Where the reader is in a PDF, and how to move: what a `pageBar` gets. */
export interface PageNav {
  /** The page in view (1-based). */
  page: number;
  pages: number;
  goTo: (page: number) => void;
  /** One page's text (pdf.js), lines joined with newlines. */
  text: (page: number) => Promise<string>;
}

interface Opened {
  items: readonly ViewerItem[];
  index: number;
}

interface FileViewerValue {
  /** Opens the viewer on `items[index]` (index defaults to 0). */
  open: (items: readonly ViewerItem[], index?: number) => void;
  close: () => void;
}

const FileViewerContext = createContext<FileViewerValue | null>(null);

/** Opens the one file viewer from any screen. */
export function useFileViewer(): FileViewerValue {
  const v = useContext(FileViewerContext);
  if (!v) throw new Error('useFileViewer must be used inside <FileViewerProvider>');
  return v;
}

/** Mounted once, at the root (app/main.tsx), inside the query client and the toast. */
export function FileViewerProvider({ children }: { children: ReactNode }) {
  const [opened, setOpened] = useState<Opened | null>(null);

  const open = useCallback((items: readonly ViewerItem[], index = 0) => {
    if (items.length === 0) return;
    setOpened({ items: [...items], index: Math.min(Math.max(0, index), items.length - 1) });
  }, []);
  const close = useCallback(() => {
    setOpened(null);
  }, []);
  const value = useMemo(() => ({ open, close }), [open, close]);

  return (
    <FileViewerContext.Provider value={value}>
      {children}
      {opened ? (
        <FileViewerOverlay
          items={opened.items}
          index={opened.index}
          onIndex={(index) => {
            setOpened((o) => (o ? { ...o, index } : o));
          }}
          onRemoved={(index) => {
            setOpened((o) => {
              if (!o) return o;
              const items = o.items.filter((_, i) => i !== index);
              return items.length === 0 ? null : { items, index: Math.min(index, items.length - 1) };
            });
          }}
          onClose={close}
        />
      ) : null}
    </FileViewerContext.Provider>
  );
}

interface FilePreviewProps {
  item: ViewerItem;
  /** Opens the file alone in its own browser window (lib/itemWindow). Left out (a phone, or already its own window): no button. */
  onOpenWindow?: (() => void) | undefined;
}

/**
 * The viewer's rendering in a box (a pane's preview), with New window. The box takes the rest of its pane's height
 * (flex-1) and the screen around it stops scrolling (Jesse, Oct 12: "only one scrolling action on each screen"): it
 * says so with data-fill, and the right column, the reading pane, the phone screen, the main area and the own-window
 * page each turn their own scroll off when they hold one (`has-[[data-fill]]`).
 */
export function FilePreview({ item, onOpenWindow }: FilePreviewProps) {
  const download = useViewerDownload();
  return (
    <div
      data-testid="file-preview"
      data-fill="true"
      className="relative min-h-40 flex-1 overflow-hidden rounded-lg border border-line bg-page"
    >
      <ViewerBody
        key={item.id}
        item={item}
        tone="light"
        onDownload={() => {
          download.start(item);
        }}
        downloading={download.pendingId === item.id}
      />
      {onOpenWindow ? (
        <Button
          size="sm"
          variant="secondary"
          icon={ExternalLink}
          className="absolute right-2 top-2 z-10"
          data-testid="file-preview-window"
          onClick={onOpenWindow}
        >
          New window
        </Button>
      ) : null}
    </div>
  );
}
