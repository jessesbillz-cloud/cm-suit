// THE file viewer (Jesse, Oct 4: "an upload and a delete and a full screen ... across the whole app"). One full-screen
// overlay for photos, PDFs and every other file, mounted once at the root (FileViewerProvider in app/main.tsx); any
// screen opens it. FilePreview is the same rendering in a box, for a pane.
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
//   <FilePreview item={item} onFullScreen={() => { viewer.open([item]); }} />  // inline, in a pane
//   In the right column a preview has no Full screen of its own: the column's one button enlarges it (Jesse, Oct 10).
//   A PDF may open at a page (`startPage`) and carry its own bar over the pages (`pageBar`: the spec book's sections),
//   which gets where the reader is (PageNav) and moves them.
//
// The overlay: file name, Download, Delete (only when the item has `remove`), Close; Escape and Close close it; focus
// stays inside; left / right (and the arrows) move through the list. Photos: fitted, tap or +/- to zoom, drag to pan.
// PDFs (pdf.js, its own lazy chunk): pages one under another, +/- and Fit, "Page N of M".
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { Maximize2 } from 'lucide-react';
import { Button } from './Button';
import { useRightColumn } from './RightColumn';
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
  /** Opens the full-screen viewer (usually `() => viewer.open(list, i)`). In the right column there is none: the
   *  column's own Full screen is the one way to enlarge it. */
  onFullScreen: () => void;
  /** The box's size, e.g. 'h-80' (default) or 'aspect-[4/3]'. */
  className?: string | undefined;
}

/** The viewer's rendering in a box (a pane's preview), with Full screen unless it sits in the right column. */
export function FilePreview({ item, onFullScreen, className = 'h-80' }: FilePreviewProps) {
  const download = useViewerDownload();
  const inColumn = useRightColumn() !== null;
  return (
    <div data-testid="file-preview" className={`relative overflow-hidden rounded-lg border border-line bg-page ${className}`}>
      <ViewerBody
        key={item.id}
        item={item}
        tone="light"
        onDownload={() => {
          download.start(item);
        }}
        downloading={download.pendingId === item.id}
      />
      {inColumn ? null : (
        <Button
          size="sm"
          variant="secondary"
          icon={Maximize2}
          className="absolute right-2 top-2 z-10"
          data-testid="file-preview-full"
          onClick={onFullScreen}
        >
          Full screen
        </Button>
      )}
    </div>
  );
}
