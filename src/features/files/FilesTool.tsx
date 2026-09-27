// Files (SPEC §8.1, Phase 0 core): folder tree, file rows with one-click download, drag-and-drop and button upload
// through the single uploader with per-file progress, and folder create for files.manage. The tree lists folders by
// sort then name (each job opens with what its kind of user uses most) and hides an empty "Emailed in".
import { useState, type DragEvent } from 'react';
import { useCanWriteFolder, useCapability, useFiles, useFolders } from '../../data/queries';
import { useUploadQueue } from '../../data/UploadQueue';
import { messageOf } from '../../data/errors';
import type { FolderRow } from '../../data/types';
import { Card } from '../../ui/Card';
import { EmptyState, ErrorState, LoadingState } from '../../ui/States';
import { useToast } from '../../ui/Toast';
import { collectDrop } from './collectDrop';
import { FileRow } from './FileRow';
import { FolderAiToggle } from './FolderAiToggle';
import { defaultFolderId, visibleFolders } from './folderOrder';
import { FolderTree } from './FolderTree';
import { NewFolderForm } from './NewFolderForm';
import { UploadButtons } from './UploadButtons';
import { UploadList } from './UploadList';
import { useDownload } from './useDownload';

interface FilesToolProps {
  projectId: string;
  /** From the URL (?folder=); null = the default folder. */
  folderId: string | null;
  selectedFileId: string | null;
  isPhone: boolean;
  onSelectFolder: (folderId: string) => void;
  onOpenFile: (fileId: string) => void;
}

interface FolderFilesProps {
  projectId: string;
  folder: FolderRow;
  canManage: boolean;
  selectedFileId: string | null;
  isPhone: boolean;
  onOpenFile: (fileId: string) => void;
}

function FolderFiles({ projectId, folder, canManage, selectedFileId, isPhone, onOpenFile }: FolderFilesProps) {
  const folderId = folder.id;
  const files = useFiles(folderId);
  const canWrite = useCanWriteFolder(folderId);
  const queue = useUploadQueue();
  const download = useDownload();
  const toast = useToast();
  const [dragging, setDragging] = useState(false);

  const writable = canWrite.data === true;
  const enqueue = (picked: File[]) => {
    if (picked.length > 0) queue.enqueue(picked, projectId, folderId);
  };

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setDragging(false);
    if (!writable) return;
    collectDrop(e.dataTransfer)
      .then(enqueue)
      .catch((err: unknown) => {
        toast.show({ tone: 'error', message: `Could not read what was dropped: ${messageOf(err)}` });
      });
  };

  return (
    <Card
      title={folder.name}
      actions={
        <>
          <FolderAiToggle folder={folder} canManage={canManage} />
          {writable ? <UploadButtons showCamera={isPhone} onFiles={enqueue} /> : null}
        </>
      }
      padded={false}
    >
      <div
        className={`min-h-40 ${dragging ? 'bg-accent-soft outline-dashed outline-2 -outline-offset-4 outline-accent' : ''}`}
        onDragOver={(e) => {
          if (!writable) return;
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => {
          setDragging(false);
        }}
        onDrop={onDrop}
      >
        <UploadList folderId={folderId} />
        {files.isPending ? <LoadingState label="Loading files" /> : null}
        {files.isError ? <ErrorState error={files.error} onRetry={() => void files.refetch()} /> : null}
        {files.data?.length === 0 ? (
          <EmptyState
            title="This folder is empty."
            hint={writable ? 'Drag files or a whole folder here, or use Upload.' : undefined}
          />
        ) : null}
        {files.data && files.data.length > 0 ? (
          <ul className="divide-y divide-line">
            {files.data.map((f) => (
              <FileRow
                key={f.id}
                file={f}
                selected={f.id === selectedFileId}
                downloading={download.pendingId === f.id}
                onOpen={onOpenFile}
                onDownload={(file) => {
                  download.start(file.id, file.size);
                }}
              />
            ))}
          </ul>
        ) : null}
      </div>
    </Card>
  );
}

export function FilesTool({ projectId, folderId, selectedFileId, isPhone, onSelectFolder, onOpenFile }: FilesToolProps) {
  const folders = useFolders(projectId);
  const canManage = useCapability(projectId, 'files.manage');

  if (folders.isPending) return <LoadingState label="Loading folders" />;
  if (folders.isError) return <ErrorState error={folders.error} onRetry={() => void folders.refetch()} />;

  const list = visibleFolders(folders.data);
  const current = folders.data.find((f) => f.id === folderId) ?? list.find((f) => f.id === defaultFolderId(list));
  const manager = canManage.data === true;
  const newFolder = manager ? <NewFolderForm projectId={projectId} onCreated={onSelectFolder} /> : null;

  if (list.length === 0 || !current) {
    return (
      <Card title="Files">
        <EmptyState title="No folders you can open on this job yet." action={newFolder} />
      </Card>
    );
  }

  return (
    <div className={`mx-auto flex max-w-6xl gap-4 ${isPhone ? 'flex-col' : 'items-start'}`}>
      <Card title="Folders" padded={false} className={isPhone ? '' : 'w-64 shrink-0'}>
        <div className="p-2">
          <FolderTree folders={list} selectedId={current.id} onSelect={onSelectFolder} />
          {newFolder}
        </div>
      </Card>
      <div className="min-w-0 flex-1">
        <FolderFiles
          key={current.id}
          projectId={projectId}
          folder={current}
          canManage={manager}
          selectedFileId={selectedFileId}
          isPhone={isPhone}
          onOpenFile={onOpenFile}
        />
      </div>
    </div>
  );
}
