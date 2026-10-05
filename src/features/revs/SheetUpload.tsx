// "No PDFs on this job yet." is not a dead end: Upload (the shared upload queue: progress, Stop, Remove) into the
// job's Plans folder when I may write there, else Files, where the plans go. The picker's list refreshes itself when
// an upload lands (data/UploadQueue).
import { useRef } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { FolderOpen, Upload } from 'lucide-react';
import { useCanWriteFolder, useFolders } from '../../data/queries';
import { useUploadQueue } from '../../data/UploadQueue';
import { Button } from '../../ui/Button';
import { UploadList } from '../files/UploadList';

export function SheetUpload({ projectId }: { projectId: string }) {
  const folders = useFolders(projectId);
  const plans = folders.data?.find((f) => f.kind === 'plans' && f.parent_id === null) ?? null;
  const canWrite = useCanWriteFolder(plans?.id ?? null);
  const queue = useUploadQueue();
  const navigate = useNavigate();
  const input = useRef<HTMLInputElement>(null);
  const toFiles = () => {
    void navigate({ to: '/p/$projectId/$tool', params: { projectId, tool: 'files' }, search: plans ? { folder: plans.id } : {} });
  };
  return (
    <div className="flex flex-col gap-2" data-testid="rev-sheet-upload">
      <div className="flex flex-wrap items-center gap-2">
        {plans && canWrite.data === true ? (
          <>
            <Button variant="primary" icon={Upload} data-testid="rev-sheet-upload-button" onClick={() => input.current?.click()}>
              Upload
            </Button>
            <input
              ref={input}
              type="file"
              accept="application/pdf,.pdf"
              multiple
              hidden
              data-testid="rev-sheet-upload-input"
              onChange={(e) => {
                const files = [...(e.target.files ?? [])];
                e.target.value = '';
                if (files.length > 0) queue.enqueue(files, projectId, plans.id);
              }}
            />
          </>
        ) : null}
        <Button variant="quiet" icon={FolderOpen} data-testid="rev-sheet-files" onClick={toFiles}>
          Files
        </Button>
      </div>
      {plans ? (
        <div className="overflow-hidden rounded-lg border border-line empty:hidden">
          <UploadList folderId={plans.id} />
        </div>
      ) : null}
    </div>
  );
}
