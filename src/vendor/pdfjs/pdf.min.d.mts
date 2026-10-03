// Hand-written types for the few pdf.js 5.4 calls the sheet viewer makes (src/features/revs/map/pdfjs.ts). The vendored
// build (pdf.min.mjs) is the official release, minified; npm's pdfjs-dist would bring its own types (SPEC §3).

export interface PageViewport {
  readonly width: number;
  readonly height: number;
  readonly scale: number;
  readonly rotation: number;
}

export interface RenderTask {
  readonly promise: Promise<void>;
  cancel(): void;
}

export interface RenderParameters {
  canvasContext: CanvasRenderingContext2D;
  viewport: PageViewport;
  /** [a, b, c, d, e, f]: applied before the viewport, e.g. a shift to draw one region of the page. */
  transform?: number[] | null;
  /** 0 = page content only (no annotations). */
  annotationMode?: number;
  background?: string | null;
}

export interface PDFPageProxy {
  /** The page's /Rotate (0, 90, 180 or 270). */
  readonly rotate: number;
  getViewport(params: { scale: number; rotation?: number; offsetX?: number; offsetY?: number }): PageViewport;
  render(params: RenderParameters): RenderTask;
  cleanup(): boolean;
}

export interface PDFDocumentProxy {
  readonly numPages: number;
  getPage(pageNumber: number): Promise<PDFPageProxy>;
  destroy(): Promise<void>;
}

export interface PDFDocumentLoadingTask {
  readonly promise: Promise<PDFDocumentProxy>;
  destroy(): Promise<void>;
}

export interface DocumentInitParameters {
  url?: string;
  data?: Uint8Array;
  disableRange?: boolean;
  disableStream?: boolean;
  isEvalSupported?: boolean;
  enableXfa?: boolean;
  /** Where the image decoders (openjpeg.wasm, openjpeg_nowasm_fallback.js) are; ends with "/". */
  wasmUrl?: string;
  /** 0 errors, 1 warnings, 5 infos. */
  verbosity?: number;
}

export declare const GlobalWorkerOptions: { workerSrc: string };
export declare const AnnotationMode: { readonly DISABLE: 0; readonly ENABLE: 1 };
export declare const version: string;
export declare function getDocument(src: DocumentInitParameters): PDFDocumentLoadingTask;
