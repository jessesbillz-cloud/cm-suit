// A request's files as items of the file viewer (ui/FileViewer), all through the request's own gate: its IR PDF and
// its attachments are shown and saved by ir-pdf 'download' / the preview through the request (authorize_ir_file), so
// whoever may see the request may look, the same as Download.
import { irFileUrl, saveIrFile } from '../../data/inspections.mutations';
import type { PreviewVia } from '../../data/preview';
import { fileKind } from '../../lib/fileKind';
import type { ViewerItem } from '../../ui/FileViewer';

type Preview = (fileId: string, via?: PreviewVia) => Promise<string>;

/** The IR PDF ("View IR"): its pages in the viewer, Download inside. */
export function irPdfItem(requestId: string, number: number | null): ViewerItem {
  return {
    id: `ir-pdf-${requestId}`,
    name: number === null ? 'IR' : `IR ${String(number)}`,
    kind: 'pdf',
    url: async () => (await irFileUrl(requestId)).url,
    download: () => saveIrFile(requestId),
  };
}

/** A request's attachments, by the names I can read. */
export function irFileItems(requestId: string, ids: readonly string[], names: Readonly<Record<string, string>>, preview: Preview): ViewerItem[] {
  return ids.map((id, i) => {
    const name = names[id] ?? `File ${String(i + 1)}`;
    return {
      id,
      name,
      kind: fileKind(name),
      url: () => preview(id, { requestId }),
      download: () => saveIrFile(requestId, id),
    };
  });
}
