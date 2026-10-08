// Setup's files (0094): Add pictures and IRs (many at once, from the picker or dropped on the card), then Link files
// for what is already on the job. The upload lines show here while they run (Stop, Retry, Remove), each one saying
// whether it linked.
import { useRef } from 'react';
import { ImagePlus } from 'lucide-react';
import { Button } from '../../../ui/Button';
import { UploadList } from '../../files/UploadList';
import { useFileDrop } from '../../files/useFileDrop';
import { LinkFiles } from './LinkFiles';
import { REV_FILES_ACCEPT, useAddRevFiles } from './useAddRevFiles';

interface RevFilesProps {
  projectId: string;
  listIds: string[];
}

export function RevFiles({ projectId, listIds }: RevFilesProps) {
  const files = useAddRevFiles(projectId);
  const drop = useFileDrop(true, files.add);
  const input = useRef<HTMLInputElement>(null);
  return (
    <section
      className={`rounded-card bg-card shadow-card ${drop.over ? 'bg-accent-soft outline-dashed outline-2 -outline-offset-4 outline-accent' : ''}`}
      data-testid="rev-files"
      data-over={drop.over ? 'true' : undefined}
      {...drop.handlers}
    >
      <div className="flex flex-wrap items-center gap-2 p-3">
        <Button icon={ImagePlus} loading={files.busy} data-testid="rev-files-add" onClick={() => input.current?.click()}>
          Add pictures and IRs
        </Button>
        <input
          ref={input}
          type="file"
          accept={REV_FILES_ACCEPT}
          multiple
          hidden
          data-testid="rev-files-input"
          onChange={(e) => {
            const picked = [...(e.target.files ?? [])];
            e.target.value = '';
            if (picked.length > 0) files.add(picked);
          }}
        />
        <LinkFiles projectId={projectId} listIds={listIds} />
        {drop.over ? <span className="text-sm font-medium text-accent">Drop to add</span> : null}
      </div>
      {files.folders.map((id) => (
        <div key={id} className="border-t border-line empty:hidden [&>div]:border-b-0">
          <UploadList folderId={id} />
        </div>
      ))}
    </section>
  );
}
