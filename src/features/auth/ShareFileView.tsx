// A shared file, open (Jesse, Oct 12: "If we share a submittal, it should just be right there"): its name, Download
// (one click), "Spec 09 29 00" when it is a submittal whose section is in the job's spec book and the reader may read
// that book (a member), and the file itself filling the page. A file that can't be shown here says so beside Download.
import { Download } from 'lucide-react';
import { Button } from '../../ui/Button';
import { FilePreview, type ViewerItem } from '../../ui/FileViewer';
import { fileIcon } from '../../ui/fileIcon';
import { Icon } from '../../ui/Icon';
import { useViewerDownload } from '../../ui/viewer/useViewerDownload';
import { SpecButton } from '../specs/SpecButton';
import { useSpecFor } from '../specs/useSpecFor';

interface ShareFileViewProps {
  item: ViewerItem;
  /** The file's job, when the server said; the spec link needs it. */
  projectId: string | null;
}

export function ShareFileView({ item, projectId }: ShareFileViewProps) {
  const download = useViewerDownload();
  const specFor = useSpecFor(projectId ?? '', projectId !== null);
  const section = specFor(item.name);
  return (
    <main data-testid="share-file" className="flex h-[100dvh] flex-col bg-page">
      <header className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-2 border-b border-line bg-card px-4 pb-3 pt-[max(env(safe-area-inset-top),0.75rem)]">
        <h1 data-testid="share-file-name" className="min-w-0 flex-1 basis-full text-[15px] font-semibold leading-5 text-ink wrap-anywhere sm:basis-0">
          {item.name}
        </h1>
        {section !== null && projectId !== null ? <SpecButton projectId={projectId} section={section} /> : null}
        <Button
          variant="primary"
          icon={Download}
          data-testid="share-download"
          loading={download.pendingId === item.id}
          onClick={() => {
            download.start(item);
          }}
        >
          Download
        </Button>
      </header>
      <div className="flex min-h-0 flex-1 flex-col p-3">
        {item.kind === 'other' ? (
          <p className="m-auto flex items-center gap-3 text-sm text-ink-2">
            <Icon icon={fileIcon(item.name)} size={20} className="shrink-0" />
            This file opens after Download.
          </p>
        ) : (
          <FilePreview item={item} />
        )}
      </div>
    </main>
  );
}
