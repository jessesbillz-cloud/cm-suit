// What the viewer shows for one item: the photo (ImageView), the PDF's pages (PdfView), or, for anything else, its
// icon, name and Download. The full-screen viewer and the inline FilePreview both use it.
import { Download } from 'lucide-react';
import { downloadErrorMessage } from '../../data/download';
import { Button } from '../Button';
import { fileIcon } from '../fileIcon';
import { Icon } from '../Icon';
import type { ViewerItem } from '../FileViewer';
import { ImageView } from './ImageView';
import { PdfView } from './PdfView';
import { useItemUrl } from './useItemUrl';

interface ViewerBodyProps {
  item: ViewerItem;
  tone: 'dark' | 'light';
  /** Download, wired by the caller (the viewer shows its spinner and its error). */
  onDownload?: (() => void) | undefined;
  downloading?: boolean | undefined;
}

interface ShownProps {
  item: ViewerItem;
  kind: 'image' | 'pdf';
  tone: 'dark' | 'light';
}

function Shown({ item, kind, tone }: ShownProps) {
  const { state, retry } = useItemUrl(item.id, item.url);
  const ink = tone === 'dark' ? 'text-white/80' : 'text-ink-2';
  if (state.status === 'loading') {
    return <span aria-hidden className={`block h-full w-full animate-pulse ${tone === 'dark' ? 'bg-white/5' : 'bg-line/50'}`} />;
  }
  if (state.status === 'error') {
    return (
      <div role="alert" className={`flex h-full flex-col items-center justify-center gap-3 px-6 text-center text-sm ${ink}`}>
        <p className={tone === 'dark' ? 'text-white' : 'text-danger'}>{previewError(state.error)}</p>
        <Button size="sm" variant="secondary" onClick={retry}>
          Try again
        </Button>
      </div>
    );
  }
  return kind === 'image' ? (
    <ImageView url={state.url} name={item.name} tone={tone} />
  ) : (
    <PdfView url={state.url} tone={tone} startPage={item.startPage} pageBar={item.pageBar} />
  );
}

/** A refusal in plain words (the download's own sentences); the server's codes stay out of sight. */
function previewError(e: Error): string {
  return e.message === 'not_image' ? "This file can't be shown here. Download it to open it." : downloadErrorMessage(e);
}

export function ViewerBody({ item, tone, onDownload, downloading }: ViewerBodyProps) {
  if (item.kind === 'image' || item.kind === 'pdf') return <Shown item={item} kind={item.kind} tone={tone} />;
  return (
    <div className={`flex h-full flex-col items-center justify-center gap-3 px-6 text-center ${tone === 'dark' ? 'text-white' : 'text-ink'}`}>
      <span className={`flex h-16 w-16 items-center justify-center rounded-2xl ${tone === 'dark' ? 'bg-white/10' : 'bg-page text-ink-2'}`}>
        <Icon icon={fileIcon(item.name)} size={30} />
      </span>
      <p className="max-w-md break-words text-sm font-medium">{item.name}</p>
      {onDownload ? (
        <Button variant="primary" icon={Download} loading={downloading} onClick={onDownload}>
          Download
        </Button>
      ) : null}
    </div>
  );
}
